import { z } from 'zod';
export declare const signupSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    displayName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    displayName: string;
}, {
    email: string;
    password: string;
    displayName: string;
}>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export declare const updateStatusSchema: z.ZodObject<{
    status: z.ZodEnum<["active", "away", "dnd", "invisible"]>;
    customStatus: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    statusExpiry: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "away" | "dnd" | "invisible";
    customStatus?: string | null | undefined;
    statusExpiry?: string | null | undefined;
}, {
    status: "active" | "away" | "dnd" | "invisible";
    customStatus?: string | null | undefined;
    statusExpiry?: string | null | undefined;
}>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export declare const createWorkspaceSchema: z.ZodObject<{
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const inviteMemberSchema: z.ZodObject<{
    email: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<["admin", "member"]>>;
}, "strip", z.ZodTypeAny, {
    email: string;
    role: "admin" | "member";
}, {
    email: string;
    role?: "admin" | "member" | undefined;
}>;
export declare const updateMemberRoleSchema: z.ZodObject<{
    role: z.ZodEnum<["owner", "admin", "member"]>;
}, "strip", z.ZodTypeAny, {
    role: "owner" | "admin" | "member";
}, {
    role: "owner" | "admin" | "member";
}>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export declare const createChannelSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    isPrivate: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    isPrivate: boolean;
    description?: string | undefined;
}, {
    name: string;
    description?: string | undefined;
    isPrivate?: boolean | undefined;
}>;
export declare const updateChannelSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | undefined;
}, {
    name?: string | undefined;
    description?: string | undefined;
}>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export declare const createDmSchema: z.ZodObject<{
    userId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    userId: string;
}, {
    userId: string;
}>;
export type CreateDmInput = z.infer<typeof createDmSchema>;
export declare const createMessageSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    channelId: z.ZodOptional<z.ZodString>;
    dmThreadId: z.ZodOptional<z.ZodString>;
    parentId: z.ZodOptional<z.ZodString>;
    body: z.ZodString;
    fileIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    isEncrypted: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    nonce: z.ZodOptional<z.ZodString>;
    encryptionVersion: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    body: string;
    isEncrypted: boolean;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
    parentId?: string | undefined;
    fileIds?: string[] | undefined;
    nonce?: string | undefined;
    encryptionVersion?: number | undefined;
}, {
    body: string;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
    parentId?: string | undefined;
    fileIds?: string[] | undefined;
    isEncrypted?: boolean | undefined;
    nonce?: string | undefined;
    encryptionVersion?: number | undefined;
}>, {
    body: string;
    isEncrypted: boolean;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
    parentId?: string | undefined;
    fileIds?: string[] | undefined;
    nonce?: string | undefined;
    encryptionVersion?: number | undefined;
}, {
    body: string;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
    parentId?: string | undefined;
    fileIds?: string[] | undefined;
    isEncrypted?: boolean | undefined;
    nonce?: string | undefined;
    encryptionVersion?: number | undefined;
}>, {
    body: string;
    isEncrypted: boolean;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
    parentId?: string | undefined;
    fileIds?: string[] | undefined;
    nonce?: string | undefined;
    encryptionVersion?: number | undefined;
}, {
    body: string;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
    parentId?: string | undefined;
    fileIds?: string[] | undefined;
    isEncrypted?: boolean | undefined;
    nonce?: string | undefined;
    encryptionVersion?: number | undefined;
}>;
export declare const updateMessageSchema: z.ZodObject<{
    body: z.ZodString;
}, "strip", z.ZodTypeAny, {
    body: string;
}, {
    body: string;
}>;
export declare const getMessagesSchema: z.ZodEffects<z.ZodObject<{
    channelId: z.ZodOptional<z.ZodString>;
    dmThreadId: z.ZodOptional<z.ZodString>;
    parentId: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
    parentId?: string | undefined;
    cursor?: string | undefined;
}, {
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
    parentId?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
}>, {
    limit: number;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
    parentId?: string | undefined;
    cursor?: string | undefined;
}, {
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
    parentId?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
}>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type GetMessagesInput = z.infer<typeof getMessagesSchema>;
export declare const addReactionSchema: z.ZodObject<{
    emoji: z.ZodString;
}, "strip", z.ZodTypeAny, {
    emoji: string;
}, {
    emoji: string;
}>;
export type AddReactionInput = z.infer<typeof addReactionSchema>;
export declare const updateReadSchema: z.ZodEffects<z.ZodObject<{
    channelId: z.ZodOptional<z.ZodString>;
    dmThreadId: z.ZodOptional<z.ZodString>;
    lastReadMessageId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    lastReadMessageId: string;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}, {
    lastReadMessageId: string;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}>, {
    lastReadMessageId: string;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}, {
    lastReadMessageId: string;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}>;
export type UpdateReadInput = z.infer<typeof updateReadSchema>;
export declare const searchSchema: z.ZodObject<{
    q: z.ZodString;
    channelId: z.ZodOptional<z.ZodString>;
    dmThreadId: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    q: string;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
    cursor?: string | undefined;
}, {
    q: string;
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
}>;
export type SearchInput = z.infer<typeof searchSchema>;
export declare const pinMessageSchema: z.ZodObject<{
    messageId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    messageId: string;
}, {
    messageId: string;
}>;
export declare const getPinnedMessagesSchema: z.ZodObject<{
    channelId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    channelId: string;
}, {
    channelId: string;
}>;
export type PinMessageInput = z.infer<typeof pinMessageSchema>;
export type GetPinnedMessagesInput = z.infer<typeof getPinnedMessagesSchema>;
export declare const saveMessageSchema: z.ZodObject<{
    messageId: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    messageId: string;
    note?: string | undefined;
}, {
    messageId: string;
    note?: string | undefined;
}>;
export declare const getSavedMessagesSchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    cursor?: string | undefined;
}, {
    cursor?: string | undefined;
    limit?: number | undefined;
}>;
export type SaveMessageInput = z.infer<typeof saveMessageSchema>;
export type GetSavedMessagesInput = z.infer<typeof getSavedMessagesSchema>;
export declare const fileUploadMetaSchema: z.ZodObject<{
    workspaceId: z.ZodString;
    messageId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    workspaceId: string;
    messageId?: string | undefined;
}, {
    workspaceId: string;
    messageId?: string | undefined;
}>;
export type FileUploadMetaInput = z.infer<typeof fileUploadMetaSchema>;
export declare const startCallSchema: z.ZodEffects<z.ZodObject<{
    scopeType: z.ZodEnum<["channel", "dm"]>;
    channelId: z.ZodOptional<z.ZodString>;
    dmThreadId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    scopeType: "channel" | "dm";
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}, {
    scopeType: "channel" | "dm";
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}>, {
    scopeType: "channel" | "dm";
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}, {
    scopeType: "channel" | "dm";
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}>;
export declare const getActiveCallSchema: z.ZodEffects<z.ZodObject<{
    channelId: z.ZodOptional<z.ZodString>;
    dmThreadId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}, {
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}>, {
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}, {
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}>;
export type StartCallInput = z.infer<typeof startCallSchema>;
export type GetActiveCallInput = z.infer<typeof getActiveCallSchema>;
export declare const joinChannelSchema: z.ZodObject<{
    channelId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    channelId: string;
}, {
    channelId: string;
}>;
export declare const joinDmSchema: z.ZodObject<{
    dmThreadId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    dmThreadId: string;
}, {
    dmThreadId: string;
}>;
export declare const typingSchema: z.ZodEffects<z.ZodObject<{
    channelId: z.ZodOptional<z.ZodString>;
    dmThreadId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}, {
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}>, {
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}, {
    channelId?: string | undefined;
    dmThreadId?: string | undefined;
}>;
export declare const callOfferSchema: z.ZodObject<{
    callId: z.ZodString;
    toUserId: z.ZodOptional<z.ZodString>;
    sdp: z.ZodObject<{
        type: z.ZodEnum<["offer", "answer", "pranswer", "rollback"]>;
        sdp: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "offer" | "answer" | "pranswer" | "rollback";
        sdp?: string | undefined;
    }, {
        type: "offer" | "answer" | "pranswer" | "rollback";
        sdp?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    callId: string;
    sdp: {
        type: "offer" | "answer" | "pranswer" | "rollback";
        sdp?: string | undefined;
    };
    toUserId?: string | undefined;
}, {
    callId: string;
    sdp: {
        type: "offer" | "answer" | "pranswer" | "rollback";
        sdp?: string | undefined;
    };
    toUserId?: string | undefined;
}>;
export declare const callAnswerSchema: z.ZodObject<{
    callId: z.ZodString;
    toUserId: z.ZodString;
    sdp: z.ZodObject<{
        type: z.ZodEnum<["offer", "answer", "pranswer", "rollback"]>;
        sdp: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "offer" | "answer" | "pranswer" | "rollback";
        sdp?: string | undefined;
    }, {
        type: "offer" | "answer" | "pranswer" | "rollback";
        sdp?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    callId: string;
    toUserId: string;
    sdp: {
        type: "offer" | "answer" | "pranswer" | "rollback";
        sdp?: string | undefined;
    };
}, {
    callId: string;
    toUserId: string;
    sdp: {
        type: "offer" | "answer" | "pranswer" | "rollback";
        sdp?: string | undefined;
    };
}>;
export declare const iceCandidateSchema: z.ZodObject<{
    callId: z.ZodString;
    toUserId: z.ZodString;
    candidate: z.ZodObject<{
        candidate: z.ZodOptional<z.ZodString>;
        sdpMid: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        sdpMLineIndex: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        usernameFragment: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        candidate?: string | undefined;
        sdpMid?: string | null | undefined;
        sdpMLineIndex?: number | null | undefined;
        usernameFragment?: string | null | undefined;
    }, {
        candidate?: string | undefined;
        sdpMid?: string | null | undefined;
        sdpMLineIndex?: number | null | undefined;
        usernameFragment?: string | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    callId: string;
    toUserId: string;
    candidate: {
        candidate?: string | undefined;
        sdpMid?: string | null | undefined;
        sdpMLineIndex?: number | null | undefined;
        usernameFragment?: string | null | undefined;
    };
}, {
    callId: string;
    toUserId: string;
    candidate: {
        candidate?: string | undefined;
        sdpMid?: string | null | undefined;
        sdpMLineIndex?: number | null | undefined;
        usernameFragment?: string | null | undefined;
    };
}>;
export type JoinChannelInput = z.infer<typeof joinChannelSchema>;
export type JoinDmInput = z.infer<typeof joinDmSchema>;
export type TypingInput = z.infer<typeof typingSchema>;
export type CallOfferInput = z.infer<typeof callOfferSchema>;
export type CallAnswerInput = z.infer<typeof callAnswerSchema>;
export type IceCandidateInput = z.infer<typeof iceCandidateSchema>;
export declare const uuidSchema: z.ZodString;
export declare const paginationSchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    cursor?: string | undefined;
}, {
    cursor?: string | undefined;
    limit?: number | undefined;
}>;
//# sourceMappingURL=index.d.ts.map