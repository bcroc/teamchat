import { BOT_SCOPES, type BotScope } from '../../middleware/botAuth.js';
import { errors } from '../../lib/errors.js';

export function validateScopes(scopes: string[]): void {
  const validScopes = Object.values(BOT_SCOPES);
  const invalidScopes = scopes.filter((s) => !validScopes.includes(s as BotScope));
  if (invalidScopes.length > 0) {
    throw errors.validation(`Invalid scopes: ${invalidScopes.join(', ')}`);
  }
}

export function getScopeDescription(scope: string): string {
  const descriptions: Record<string, string> = {
    'messages:read': 'Read messages in channels the bot has access to',
    'messages:write': 'Send messages to channels',
    'messages:delete': 'Delete messages sent by the bot',
    'channels:read': 'View channel information',
    'channels:write': 'Create and modify channels',
    'channels:history': 'Access message history in channels',
    'users:read': 'View user profile information',
    'reactions:read': 'View reactions on messages',
    'reactions:write': 'Add and remove reactions',
    'files:read': 'View and download files',
    'files:write': 'Upload files',
    'webhooks:read': 'View webhook configurations',
    'webhooks:write': 'Create and manage webhooks',
  };
  return descriptions[scope] || scope;
}
