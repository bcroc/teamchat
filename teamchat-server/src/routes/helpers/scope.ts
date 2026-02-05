import { errors } from '../../lib/errors.js';
import { requireScopeAccess } from '../../middleware/auth.js';

export async function requireScopeAccessWithMessage(
  userId: string,
  scope: { channelId?: string | null; dmThreadId?: string | null },
  invalidMessage: string
) {
  if (!scope.channelId && !scope.dmThreadId) {
    throw errors.validation(invalidMessage);
  }
  return requireScopeAccess(userId, scope);
}
