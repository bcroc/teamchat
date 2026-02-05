export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function channelRoom(channelId: string): string {
  return `channel:${channelId}`;
}

export function dmRoom(dmThreadId: string): string {
  return `dm:${dmThreadId}`;
}

export function callRoom(callId: string): string {
  return `call:${callId}`;
}

export function scopeRoom(scope: { channelId?: string | null; dmThreadId?: string | null }): string {
  if (scope.channelId) {
    return channelRoom(scope.channelId);
  }
  return dmRoom(scope.dmThreadId as string);
}
