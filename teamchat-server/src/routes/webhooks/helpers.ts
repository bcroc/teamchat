import { randomBytes } from 'crypto';
import { getSocketServer } from '../../socket/index.js';
import { SOCKET_EVENTS } from '@teamchat/shared';
import type { WebhookMessageInput } from './schemas.js';

export function generateWebhookToken(): string {
  return randomBytes(32).toString('base64url');
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

export function emitWebhookMessageCreated(channelId: string, message: any, sender: any): void {
  const io = getSocketServer();
  io.to(`channel:${channelId}`).emit(SOCKET_EVENTS.MESSAGE_CREATED, {
    message: {
      ...message,
      sender,
    },
  });
}

export function formatWebhookMessageBody(data: WebhookMessageInput): string {
  let messageBody = data.text;

  if (data.attachments && data.attachments.length > 0) {
    const attachmentText = data.attachments
      .map((att) => {
        let text = '';
        if (att.title) {
          text += att.titleLink ? `**[${att.title}](${att.titleLink})**\n` : `**${att.title}**\n`;
        }
        if (att.text) {
          text += att.text + '\n';
        }
        if (att.fields) {
          text += att.fields.map((f) => `**${f.title}:** ${f.value}`).join('\n') + '\n';
        }
        if (att.footer) {
          text += `_${att.footer}_`;
        }
        return text.trim();
      })
      .join('\n\n');

    if (attachmentText) {
      messageBody += '\n\n' + attachmentText;
    }
  }

  return messageBody;
}
