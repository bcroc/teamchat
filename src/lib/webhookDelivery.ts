import { createHmac } from 'crypto';
import { prisma } from './db.js';
import type {
  MessageEventPayload,
  ReactionEventPayload,
  ChannelEventPayload,
  MemberEventPayload,
} from '@teamchat/shared';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s

interface WebhookEvent {
  type: string;
  workspaceId: string;
  channelId?: string | null;
  payload: object;
}

/**
 * Sign a webhook payload with HMAC-SHA256
 */
function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Deliver an event to matching outgoing webhooks
 */
export async function deliverWebhookEvent(event: WebhookEvent): Promise<void> {
  const { type, workspaceId, channelId, payload } = event;

  // Find matching webhooks
  const webhooks = await prisma.outgoingWebhook.findMany({
    where: {
      workspaceId,
      isEnabled: true,
      events: { has: type },
      // If channelIds is empty, webhook receives all events
      // If channelIds is set, only events from those channels
      OR: [
        { channelIds: { isEmpty: true } },
        ...(channelId ? [{ channelIds: { has: channelId } }] : []),
      ],
    },
    select: {
      id: true,
      url: true,
      secret: true,
    },
  });

  // Deliver to each webhook
  await Promise.all(
    webhooks.map((webhook) => deliverToWebhook(webhook, type, payload))
  );
}

/**
 * Deliver payload to a single webhook
 */
async function deliverToWebhook(
  webhook: { id: string; url: string; secret: string },
  eventType: string,
  payload: object
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, webhook.secret);
  const timestamp = Date.now().toString();

  // Create delivery record
  const delivery = await prisma.webhookDelivery.create({
    data: {
      webhookId: webhook.id,
      eventType,
      payload: payload as object,
      status: 'pending',
    },
  });

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TeamChat-Signature': `sha256=${signature}`,
        'X-TeamChat-Timestamp': timestamp,
        'X-TeamChat-Event': eventType,
        'X-TeamChat-Delivery': delivery.id,
      },
      body,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseBody = await response.text().catch(() => '');

    // Update delivery record
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        responseStatus: response.status,
        responseBody: responseBody.slice(0, 1000), // Limit stored response
        deliveredAt: new Date(),
        status: response.ok ? 'delivered' : 'failed',
        errorMessage: response.ok ? null : `HTTP ${response.status}`,
      },
    });

    // Schedule retry if failed and retries remaining
    if (!response.ok && delivery.retryCount < MAX_RETRIES) {
      scheduleRetry(delivery.id, delivery.retryCount + 1);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'failed',
        errorMessage,
      },
    });

    // Schedule retry if retries remaining
    if (delivery.retryCount < MAX_RETRIES) {
      scheduleRetry(delivery.id, delivery.retryCount + 1);
    }
  }
}

/**
 * Schedule a retry for a failed delivery
 */
function scheduleRetry(deliveryId: string, retryCount: number): void {
  const delay = RETRY_DELAYS[retryCount - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];

  setTimeout(async () => {
    await retryDelivery(deliveryId, retryCount);
  }, delay);
}

/**
 * Retry a failed delivery
 */
async function retryDelivery(deliveryId: string, retryCount: number): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      webhook: {
        select: { id: true, url: true, secret: true, isEnabled: true },
      },
    },
  });

  if (!delivery || !delivery.webhook.isEnabled) {
    return;
  }

  // Update retry count
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      retryCount,
      status: 'pending',
    },
  });

  const body = JSON.stringify(delivery.payload);
  const signature = signPayload(body, delivery.webhook.secret);
  const timestamp = Date.now().toString();

  try {
    const response = await fetch(delivery.webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TeamChat-Signature': `sha256=${signature}`,
        'X-TeamChat-Timestamp': timestamp,
        'X-TeamChat-Event': delivery.eventType,
        'X-TeamChat-Delivery': delivery.id,
        'X-TeamChat-Retry': retryCount.toString(),
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    const responseBody = await response.text().catch(() => '');

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        responseStatus: response.status,
        responseBody: responseBody.slice(0, 1000),
        deliveredAt: new Date(),
        status: response.ok ? 'delivered' : 'failed',
        errorMessage: response.ok ? null : `HTTP ${response.status}`,
      },
    });

    // Schedule another retry if still failed
    if (!response.ok && retryCount < MAX_RETRIES) {
      scheduleRetry(deliveryId, retryCount + 1);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'failed',
        errorMessage,
      },
    });

    if (retryCount < MAX_RETRIES) {
      scheduleRetry(deliveryId, retryCount + 1);
    }
  }
}

// ============================================
// Event Emitters (call these from your routes)
// ============================================

export async function emitMessageCreatedWebhook(
  message: {
    id: string;
    body: string;
    channelId?: string | null;
    dmThreadId?: string | null;
    senderId: string;
    botId?: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  sender: { id: string; displayName: string },
  workspace: { id: string; name: string },
  channel?: { id: string; name: string } | null
): Promise<void> {
  const payload: MessageEventPayload = {
    type: 'message.created',
    timestamp: new Date().toISOString(),
    workspace,
    message: {
      id: message.id,
      body: message.body,
      channelId: message.channelId,
      dmThreadId: message.dmThreadId,
      senderId: message.senderId,
      botId: message.botId,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
    },
    channel,
    sender,
  };

  await deliverWebhookEvent({
    type: 'message.created',
    workspaceId: workspace.id,
    channelId: message.channelId,
    payload,
  });
}

export async function emitMessageUpdatedWebhook(
  message: {
    id: string;
    body: string;
    channelId?: string | null;
    dmThreadId?: string | null;
    senderId: string;
    botId?: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  sender: { id: string; displayName: string },
  workspace: { id: string; name: string },
  channel?: { id: string; name: string } | null
): Promise<void> {
  const payload: MessageEventPayload = {
    type: 'message.updated',
    timestamp: new Date().toISOString(),
    workspace,
    message: {
      id: message.id,
      body: message.body,
      channelId: message.channelId,
      dmThreadId: message.dmThreadId,
      senderId: message.senderId,
      botId: message.botId,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
    },
    channel,
    sender,
  };

  await deliverWebhookEvent({
    type: 'message.updated',
    workspaceId: workspace.id,
    channelId: message.channelId,
    payload,
  });
}

export async function emitMessageDeletedWebhook(
  messageId: string,
  workspaceId: string,
  workspaceName: string,
  channelId?: string | null
): Promise<void> {
  const payload = {
    type: 'message.deleted',
    timestamp: new Date().toISOString(),
    workspace: { id: workspaceId, name: workspaceName },
    message: { id: messageId },
  };

  await deliverWebhookEvent({
    type: 'message.deleted',
    workspaceId,
    channelId,
    payload,
  });
}

export async function emitReactionAddedWebhook(
  reaction: { id: string; messageId: string; userId: string; emoji: string },
  message: { id: string; channelId?: string | null },
  user: { id: string; displayName: string },
  workspace: { id: string; name: string }
): Promise<void> {
  const payload: ReactionEventPayload = {
    type: 'reaction.added',
    timestamp: new Date().toISOString(),
    workspace,
    reaction,
    message,
    user,
  };

  await deliverWebhookEvent({
    type: 'reaction.added',
    workspaceId: workspace.id,
    channelId: message.channelId,
    payload,
  });
}

export async function emitReactionRemovedWebhook(
  reaction: { id: string; messageId: string; userId: string; emoji: string },
  message: { id: string; channelId?: string | null },
  user: { id: string; displayName: string },
  workspace: { id: string; name: string }
): Promise<void> {
  const payload: ReactionEventPayload = {
    type: 'reaction.removed',
    timestamp: new Date().toISOString(),
    workspace,
    reaction,
    message,
    user,
  };

  await deliverWebhookEvent({
    type: 'reaction.removed',
    workspaceId: workspace.id,
    channelId: message.channelId,
    payload,
  });
}

export async function emitChannelCreatedWebhook(
  channel: {
    id: string;
    name: string;
    description?: string | null;
    isPrivate: boolean;
    isArchived: boolean;
  },
  workspace: { id: string; name: string }
): Promise<void> {
  const payload: ChannelEventPayload = {
    type: 'channel.created',
    timestamp: new Date().toISOString(),
    workspace,
    channel,
  };

  await deliverWebhookEvent({
    type: 'channel.created',
    workspaceId: workspace.id,
    channelId: channel.id,
    payload,
  });
}

export async function emitChannelUpdatedWebhook(
  channel: {
    id: string;
    name: string;
    description?: string | null;
    isPrivate: boolean;
    isArchived: boolean;
  },
  workspace: { id: string; name: string }
): Promise<void> {
  const payload: ChannelEventPayload = {
    type: 'channel.updated',
    timestamp: new Date().toISOString(),
    workspace,
    channel,
  };

  await deliverWebhookEvent({
    type: 'channel.updated',
    workspaceId: workspace.id,
    channelId: channel.id,
    payload,
  });
}

export async function emitChannelArchivedWebhook(
  channel: {
    id: string;
    name: string;
    description?: string | null;
    isPrivate: boolean;
    isArchived: boolean;
  },
  workspace: { id: string; name: string }
): Promise<void> {
  const payload: ChannelEventPayload = {
    type: 'channel.archived',
    timestamp: new Date().toISOString(),
    workspace,
    channel,
  };

  await deliverWebhookEvent({
    type: 'channel.archived',
    workspaceId: workspace.id,
    channelId: channel.id,
    payload,
  });
}

export async function emitMemberJoinedWebhook(
  member: { userId: string; displayName: string },
  workspace: { id: string; name: string },
  channel?: { id: string; name: string } | null
): Promise<void> {
  const payload: MemberEventPayload = {
    type: 'member.joined',
    timestamp: new Date().toISOString(),
    workspace,
    member,
    channel,
  };

  await deliverWebhookEvent({
    type: 'member.joined',
    workspaceId: workspace.id,
    channelId: channel?.id,
    payload,
  });
}

export async function emitMemberLeftWebhook(
  member: { userId: string; displayName: string },
  workspace: { id: string; name: string },
  channel?: { id: string; name: string } | null
): Promise<void> {
  const payload: MemberEventPayload = {
    type: 'member.left',
    timestamp: new Date().toISOString(),
    workspace,
    member,
    channel,
  };

  await deliverWebhookEvent({
    type: 'member.left',
    workspaceId: workspace.id,
    channelId: channel?.id,
    payload,
  });
}
