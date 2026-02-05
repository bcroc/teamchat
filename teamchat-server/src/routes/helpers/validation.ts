import { errors } from '../../lib/errors.js';

export function assertZodSuccess<T>(
  result: { success: true; data: T } | { success: false; error: { flatten(): unknown } },
  message = 'Invalid input'
): T {
  if (!result.success) {
    throw errors.validation(message, { errors: result.error.flatten() });
  }
  return result.data;
}
