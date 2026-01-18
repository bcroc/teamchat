// ============================================
// Core Entity Types
// ============================================

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type UserStatus = 'active' | 'away' | 'dnd' | 'invisible';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  status?: UserStatus;
  customStatus?: string | null;
  statusExpiry?: Date | null;
  createdAt: Date;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: Date;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: Date;
  user?: User;
}

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  topic?: string | null;
  isPrivate: boolean;
  isArchived: boolean;
  createdBy: string;
  createdAt: Date;
}

export interface ScheduledMessage {
  id: string;
  workspaceId: string;
  channelId?: string | null;
  dmThreadId?: string | null;
  senderId: string;
  body: string;
  scheduledAt: Date;
  status: 'pending' | 'sent' | 'cancelled';
  sentAt?: Date | null;
  createdAt: Date;
}

export interface Reminder {
  id: string;
  userId: string;
  workspaceId: string;
  messageId?: string | null;
  text: string;
  remindAt: Date;
  status: 'pending' | 'completed' | 'dismissed';
  completedAt?: Date | null;
  createdAt: Date;
}

export interface ChannelSettings {
  id: string;
  channelId: string;
  userId: string;
  muted: boolean;
  muteUntil?: Date | null;
  notificationLevel: 'all' | 'mentions' | 'none';
}

export interface UserPreferences {
  id: string;
  userId: string;
  desktopNotifications: boolean;
  soundEnabled: boolean;
  notifyOnMentions: boolean;
  notifyOnDms: boolean;
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  compactMode: boolean;
}

export interface ChannelMember {
  channelId: string;
  userId: string;
  joinedAt: Date;
  user?: User;
}

export interface DmThread {
  id: string;
  workspaceId: string;
  userAId?: string | null; // For 1:1 DMs
  userBId?: string | null; // For 1:1 DMs
  isGroup: boolean;
  name?: string | null; // Group DM name
  createdAt: Date;
  userA?: User;
  userB?: User;
  participants?: DmParticipant[]; // For group DMs
}

export interface DmParticipant {
  id: string;
  dmThreadId: string;
  userId: string;
  joinedAt: Date;
  leftAt?: Date | null;
  user?: User;
}

export interface Message {
  id: string;
  workspaceId: string;
  channelId?: string | null;
  dmThreadId?: string | null;
  senderId: string;
  parentId?: string | null;
  body: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  sender?: User;
  reactions?: Reaction[];
  replyCount?: number;
  files?: FileAttachment[];
  // E2EE fields
  isEncrypted?: boolean;
  nonce?: string | null;
  encryptionVersion?: number | null;
}

export interface Reaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
  user?: User;
}

export interface ReadReceipt {
  id: string;
  workspaceId: string;
  userId: string;
  channelId?: string | null;
  dmThreadId?: string | null;
  lastReadMessageId: string;
  updatedAt: Date;
}

export interface FileAttachment {
  id: string;
  workspaceId: string;
  uploaderId: string;
  messageId?: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  createdAt: Date;
}

export interface PinnedMessage {
  id: string;
  channelId: string;
  messageId: string;
  pinnedBy: string;
  pinnedAt: Date;
  message?: Message;
  pinner?: User;
}

export interface SavedMessage {
  id: string;
  userId: string;
  messageId: string;
  savedAt: Date;
  note?: string | null;
  message?: Message;
}

// ============================================
// Call Types
// ============================================

export type CallScopeType = 'channel' | 'dm';
export type CallStatus = 'active' | 'ended';
export type CallParticipantStatus = 'connecting' | 'connected' | 'disconnected';

export interface CallSession {
  id: string;
  workspaceId: string;
  scopeType: CallScopeType;
  channelId?: string | null;
  dmThreadId?: string | null;
  createdBy: string;
  status: CallStatus;
  startedAt: Date;
  endedAt?: Date | null;
  participants?: CallParticipant[];
}

export interface CallParticipant {
  id: string;
  callSessionId: string;
  userId: string;
  joinedAt: Date;
  leftAt?: Date | null;
  user?: User;
}

// ============================================
// Audit Log
// ============================================

export type AuditAction =
  | 'workspace.created'
  | 'workspace.updated'
  | 'member.invited'
  | 'member.removed'
  | 'member.role_changed'
  | 'channel.created'
  | 'channel.deleted'
  | 'channel.updated'
  | 'message.deleted'
  | 'call.started'
  | 'call.ended';

export interface AuditLog {
  id: string;
  workspaceId: string;
  actorId: string;
  action: AuditAction;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ============================================
// API Response Types
// ============================================

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================
// Auth Types
// ============================================

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  isServerAdmin?: boolean;
}

export interface LoginResponse {
  user: AuthUser;
  token?: string;
}

// ============================================
// Socket Event Types
// ============================================

export interface TypingEvent {
  userId: string;
  channelId?: string;
  dmThreadId?: string;
  displayName: string;
}

export interface PresenceUpdate {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeen?: Date;
}

// ============================================
// WebRTC Types
// ============================================

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface CallOffer {
  callId: string;
  fromUserId: string;
  toUserId?: string; // For 1:1 calls
  sdp: RTCSessionDescriptionInit;
}

export interface CallAnswer {
  callId: string;
  fromUserId: string;
  toUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface IceCandidate {
  callId: string;
  fromUserId: string;
  toUserId: string;
  candidate: RTCIceCandidateInit;
}

export type ClientCallState =
  | 'idle'
  | 'ringing_outgoing'
  | 'ringing_incoming'
  | 'connecting'
  | 'in_call'
  | 'reconnecting'
  | 'ended';

export interface CallMediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
}

export interface ParticipantState {
  oderId: string;
  mediaState: CallMediaState;
  stream?: MediaStream;
  screenStream?: MediaStream;
}

// ============================================
// Bot & Integration Types
// ============================================

export interface Bot {
  id: string;
  workspaceId: string;
  name: string;
  displayName: string;
  description?: string | null;
  avatarUrl?: string | null;
  createdBy: string;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  scopes?: BotScope[];
}

export interface BotScope {
  id: string;
  botId: string;
  scope: string;
  createdAt: Date;
}

export interface BotToken {
  id: string;
  botId: string;
  tokenPrefix: string;
  name: string;
  lastUsedAt?: Date | null;
  expiresAt?: Date | null;
  isRevoked: boolean;
  createdAt: Date;
}

export interface IncomingWebhook {
  id: string;
  workspaceId: string;
  botId?: string | null;
  channelId: string;
  name: string;
  description?: string | null;
  token: string;
  createdBy: string;
  isEnabled: boolean;
  createdAt: Date;
}

export interface OutgoingWebhook {
  id: string;
  workspaceId: string;
  botId?: string | null;
  name: string;
  description?: string | null;
  url: string;
  events: string[];
  channelIds: string[];
  createdBy: string;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, unknown>;
  responseStatus?: number | null;
  deliveredAt?: Date | null;
  retryCount: number;
  status: 'pending' | 'delivered' | 'failed';
  errorMessage?: string | null;
  createdAt: Date;
}

export interface BotSlashCommand {
  id: string;
  workspaceId: string;
  botId: string;
  command: string;
  description: string;
  usageHint?: string | null;
  url: string;
  createdAt: Date;
}

export type InteractiveActionType = 'button' | 'select' | 'overflow';
export type InteractiveButtonStyle = 'primary' | 'danger' | 'default';

// ============================================
// End-to-End Encryption Types
// ============================================

export interface UserEncryptionKey {
  id: string;
  userId: string;
  deviceId: string;
  publicKey: string; // Base64-encoded X25519 public key
  keySignature: string;
  algorithm: 'X25519';
  isActive: boolean;
  createdAt: Date;
}

export interface ConversationKeyShare {
  id: string;
  conversationType: 'channel' | 'dm';
  conversationId: string;
  senderKeyId: string;
  recipientKeyId: string;
  encryptedKey: string; // Base64-encoded encrypted symmetric key
  keyVersion: number;
  nonce: string;
  createdAt: Date;
}

export interface EncryptedMessage {
  ciphertext: string; // Base64-encoded encrypted content
  nonce: string; // Base64-encoded nonce
  keyVersion: number;
}

export interface E2EEKeyPair {
  publicKey: string; // Base64-encoded
  privateKey: string; // Base64-encoded (stored locally only)
}

export interface E2EEDeviceInfo {
  deviceId: string;
  publicKey: string;
  lastSeen?: Date;
}

// ============================================
// Admin Panel Types
// ============================================

export interface ServerSettings {
  id: string;
  serverName: string;
  serverDescription?: string | null;
  allowPublicRegistration: boolean;
  requireEmailVerification: boolean;
  maxWorkspacesPerUser: number;
  maxMembersPerWorkspace: number;
  maxFileUploadSize: number;
  allowedFileTypes: string[];
  enableE2EE: boolean;
  maintenanceMode: boolean;
  maintenanceMessage?: string | null;
  updatedAt: Date;
}

export interface AdminUser extends User {
  isServerAdmin: boolean;
  isSuspended: boolean;
  suspendedAt?: Date | null;
  suspendReason?: string | null;
  lastLoginAt?: Date | null;
  loginCount: number;
  workspaceCount?: number;
  messageCount?: number;
}

export interface AdminWorkspace extends Workspace {
  description?: string | null;
  iconUrl?: string | null;
  isPublic: boolean;
  isDisabled: boolean;
  disabledAt?: Date | null;
  maxMembers?: number | null;
  memberCount?: number;
  channelCount?: number;
  messageCount?: number;
}

export interface AdminAuditLog {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  details: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  admin?: {
    id: string;
    email: string;
    displayName: string;
  };
}

export interface SystemAnnouncement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'critical';
  isActive: boolean;
  startsAt: Date;
  endsAt?: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminDashboardStats {
  users: {
    total: number;
    active: number;
    suspended: number;
    newToday: number;
  };
  workspaces: {
    total: number;
    disabled: number;
  };
  messages: {
    total: number;
    today: number;
  };
  storage: {
    totalFiles: number;
    totalBytes: number;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface InteractiveAction {
  id: string;
  messageId: string;
  actionId: string;
  type: InteractiveActionType;
  label: string;
  value?: string | null;
  style?: InteractiveButtonStyle | null;
  url?: string | null;
  confirm?: {
    title: string;
    text: string;
    confirmText?: string;
    denyText?: string;
  } | null;
  options?: Array<{
    label: string;
    value: string;
    description?: string;
  }> | null;
  position: number;
}

// Webhook event payload types
export interface WebhookEventPayload {
  type: string;
  timestamp: string;
  workspace: {
    id: string;
    name: string;
  };
}

export interface MessageEventPayload extends WebhookEventPayload {
  type: 'message.created' | 'message.updated' | 'message.deleted';
  message: {
    id: string;
    body: string;
    channelId?: string | null;
    dmThreadId?: string | null;
    senderId: string;
    botId?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  channel?: {
    id: string;
    name: string;
  } | null;
  sender: {
    id: string;
    displayName: string;
  };
}

export interface ReactionEventPayload extends WebhookEventPayload {
  type: 'reaction.added' | 'reaction.removed';
  reaction: {
    id: string;
    messageId: string;
    userId: string;
    emoji: string;
  };
  message: {
    id: string;
    channelId?: string | null;
  };
  user: {
    id: string;
    displayName: string;
  };
}

export interface ChannelEventPayload extends WebhookEventPayload {
  type: 'channel.created' | 'channel.updated' | 'channel.deleted' | 'channel.archived';
  channel: {
    id: string;
    name: string;
    description?: string | null;
    isPrivate: boolean;
    isArchived: boolean;
  };
}

export interface MemberEventPayload extends WebhookEventPayload {
  type: 'member.joined' | 'member.left';
  member: {
    userId: string;
    displayName: string;
  };
  channel?: {
    id: string;
    name: string;
  } | null;
}

// Bot API request/response types
export interface CreateBotRequest {
  name: string;
  displayName: string;
  description?: string;
  avatarUrl?: string;
  scopes: string[];
}

export interface UpdateBotRequest {
  displayName?: string;
  description?: string;
  avatarUrl?: string;
  isEnabled?: boolean;
}

export interface CreateBotTokenResponse {
  token: string; // Only returned once at creation
  tokenPrefix: string;
  name: string;
  expiresAt?: string | null;
}

export interface IncomingWebhookMessage {
  text: string;
  username?: string;
  iconUrl?: string;
  attachments?: Array<{
    color?: string;
    title?: string;
    titleLink?: string;
    text?: string;
    fields?: Array<{
      title: string;
      value: string;
      short?: boolean;
    }>;
    imageUrl?: string;
    thumbUrl?: string;
    footer?: string;
    footerIcon?: string;
    ts?: number;
  }>;
  actions?: Array<{
    type: 'button' | 'select';
    actionId: string;
    label: string;
    value?: string;
    style?: 'primary' | 'danger' | 'default';
    url?: string;
    confirm?: {
      title: string;
      text: string;
      confirmText?: string;
      denyText?: string;
    };
    options?: Array<{
      label: string;
      value: string;
      description?: string;
    }>;
  }>;
}
