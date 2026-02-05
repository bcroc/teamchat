export const WEBHOOK_EVENTS = {
  MESSAGE_CREATED: 'message.created',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_DELETED: 'message.deleted',
  REACTION_ADDED: 'reaction.added',
  REACTION_REMOVED: 'reaction.removed',
  CHANNEL_CREATED: 'channel.created',
  CHANNEL_UPDATED: 'channel.updated',
  CHANNEL_DELETED: 'channel.deleted',
  CHANNEL_ARCHIVED: 'channel.archived',
  MEMBER_JOINED: 'member.joined',
  MEMBER_LEFT: 'member.left',
} as const;

export function getEventDescription(event: string): string {
  const descriptions: Record<string, string> = {
    'message.created': 'When a new message is posted',
    'message.updated': 'When a message is edited',
    'message.deleted': 'When a message is deleted',
    'reaction.added': 'When a reaction is added to a message',
    'reaction.removed': 'When a reaction is removed from a message',
    'channel.created': 'When a new channel is created',
    'channel.updated': 'When a channel is updated',
    'channel.deleted': 'When a channel is deleted',
    'channel.archived': 'When a channel is archived',
    'member.joined': 'When a member joins a channel or workspace',
    'member.left': 'When a member leaves a channel or workspace',
  };
  return descriptions[event] || event;
}
