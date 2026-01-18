import { z } from 'zod';

// ============================================
// Auth Schemas
// ============================================

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(50, 'Display name must not exceed 50 characters')
    .trim(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// ============================================
// User Status Schemas
// ============================================

export const updateStatusSchema = z.object({
  status: z.enum(['active', 'away', 'dnd', 'invisible']),
  customStatus: z.string().max(100).optional().nullable(),
  statusExpiry: z.string().datetime().optional().nullable(),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

// ============================================
// Workspace Schemas
// ============================================

export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .min(2, 'Workspace name must be at least 2 characters')
    .max(50, 'Workspace name must not exceed 50 characters')
    .trim(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member']).default('member'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

// ============================================
// Channel Schemas
// ============================================

export const createChannelSchema = z.object({
  name: z
    .string()
    .min(2, 'Channel name must be at least 2 characters')
    .max(50, 'Channel name must not exceed 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Channel name can only contain lowercase letters, numbers, and hyphens')
    .trim(),
  description: z
    .string()
    .max(200, 'Description must not exceed 200 characters')
    .optional(),
  isPrivate: z.boolean().default(false),
});

export const updateChannelSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .trim()
    .optional(),
  description: z.string().max(200).optional(),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

// ============================================
// DM Schemas
// ============================================

export const createDmSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});

export type CreateDmInput = z.infer<typeof createDmSchema>;

// ============================================
// Message Schemas
// ============================================

export const createMessageSchema = z.object({
  channelId: z.string().uuid().optional(),
  dmThreadId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  body: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(10000, 'Message must not exceed 10000 characters'), // Increased for encrypted content
  fileIds: z.array(z.string().uuid()).max(10).optional(),
  // E2EE fields
  isEncrypted: z.boolean().optional().default(false),
  nonce: z.string().max(100).optional(), // Base64 encryption nonce
  encryptionVersion: z.number().int().min(1).optional(),
}).refine(
  (data) => data.channelId || data.dmThreadId,
  'Either channelId or dmThreadId must be provided'
).refine(
  (data) => !data.isEncrypted || (data.nonce && data.encryptionVersion),
  'Encrypted messages require nonce and encryptionVersion'
);

export const updateMessageSchema = z.object({
  body: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(4000, 'Message must not exceed 4000 characters'),
});

export const getMessagesSchema = z.object({
  channelId: z.string().uuid().optional(),
  dmThreadId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).refine(
  (data) => data.channelId || data.dmThreadId,
  'Either channelId or dmThreadId must be provided'
);

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type GetMessagesInput = z.infer<typeof getMessagesSchema>;

// ============================================
// Reaction Schemas
// ============================================

export const addReactionSchema = z.object({
  emoji: z
    .string()
    .min(1)
    .max(32, 'Emoji must not exceed 32 characters'),
});

export type AddReactionInput = z.infer<typeof addReactionSchema>;

// ============================================
// Read Receipt Schemas
// ============================================

export const updateReadSchema = z.object({
  channelId: z.string().uuid().optional(),
  dmThreadId: z.string().uuid().optional(),
  lastReadMessageId: z.string().uuid(),
}).refine(
  (data) => data.channelId || data.dmThreadId,
  'Either channelId or dmThreadId must be provided'
);

export type UpdateReadInput = z.infer<typeof updateReadSchema>;

// ============================================
// Search Schemas
// ============================================

export const searchSchema = z.object({
  q: z.string().min(1).max(100),
  channelId: z.string().uuid().optional(),
  dmThreadId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchInput = z.infer<typeof searchSchema>;

// ============================================
// Pinned Message Schemas
// ============================================

export const pinMessageSchema = z.object({
  messageId: z.string().uuid(),
});

export const getPinnedMessagesSchema = z.object({
  channelId: z.string().uuid(),
});

export type PinMessageInput = z.infer<typeof pinMessageSchema>;
export type GetPinnedMessagesInput = z.infer<typeof getPinnedMessagesSchema>;

// ============================================
// Saved Message Schemas
// ============================================

export const saveMessageSchema = z.object({
  messageId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

export const getSavedMessagesSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SaveMessageInput = z.infer<typeof saveMessageSchema>;
export type GetSavedMessagesInput = z.infer<typeof getSavedMessagesSchema>;

// ============================================
// File Schemas
// ============================================

export const fileUploadMetaSchema = z.object({
  workspaceId: z.string().uuid(),
  messageId: z.string().uuid().optional(),
});

export type FileUploadMetaInput = z.infer<typeof fileUploadMetaSchema>;

// ============================================
// Call Schemas
// ============================================

export const startCallSchema = z.object({
  scopeType: z.enum(['channel', 'dm']),
  channelId: z.string().uuid().optional(),
  dmThreadId: z.string().uuid().optional(),
}).refine(
  (data) => {
    if (data.scopeType === 'channel') return !!data.channelId;
    if (data.scopeType === 'dm') return !!data.dmThreadId;
    return false;
  },
  'Provide channelId for channel calls or dmThreadId for DM calls'
);

export const getActiveCallSchema = z.object({
  channelId: z.string().uuid().optional(),
  dmThreadId: z.string().uuid().optional(),
}).refine(
  (data) => data.channelId || data.dmThreadId,
  'Either channelId or dmThreadId must be provided'
);

export type StartCallInput = z.infer<typeof startCallSchema>;
export type GetActiveCallInput = z.infer<typeof getActiveCallSchema>;

// ============================================
// Socket Event Schemas
// ============================================

export const joinChannelSchema = z.object({
  channelId: z.string().uuid(),
});

export const joinDmSchema = z.object({
  dmThreadId: z.string().uuid(),
});

export const typingSchema = z.object({
  channelId: z.string().uuid().optional(),
  dmThreadId: z.string().uuid().optional(),
}).refine(
  (data) => data.channelId || data.dmThreadId,
  'Either channelId or dmThreadId must be provided'
);

export const callOfferSchema = z.object({
  callId: z.string().uuid(),
  toUserId: z.string().uuid().optional(),
  sdp: z.object({
    type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
    sdp: z.string().optional(),
  }),
});

export const callAnswerSchema = z.object({
  callId: z.string().uuid(),
  toUserId: z.string().uuid(),
  sdp: z.object({
    type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
    sdp: z.string().optional(),
  }),
});

export const iceCandidateSchema = z.object({
  callId: z.string().uuid(),
  toUserId: z.string().uuid(),
  candidate: z.object({
    candidate: z.string().optional(),
    sdpMid: z.string().nullable().optional(),
    sdpMLineIndex: z.number().nullable().optional(),
    usernameFragment: z.string().nullable().optional(),
  }),
});

export type JoinChannelInput = z.infer<typeof joinChannelSchema>;
export type JoinDmInput = z.infer<typeof joinDmSchema>;
export type TypingInput = z.infer<typeof typingSchema>;
export type CallOfferInput = z.infer<typeof callOfferSchema>;
export type CallAnswerInput = z.infer<typeof callAnswerSchema>;
export type IceCandidateInput = z.infer<typeof iceCandidateSchema>;

// ============================================
// Common Validation Helpers
// ============================================

export const uuidSchema = z.string().uuid();
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
