import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketStore } from '../stores/socket';
import { useWorkspaceStore } from '../stores/workspace';
import { useUnreadStore } from '../stores/unread';
import { useAuthStore } from '../stores/auth';
import type { Message } from '@teamchat/shared';

/**
 * Hook to listen for new messages via socket and update unread counts.
 * Should be used once at the app root level.
 */
export function useMessageListener() {
  const queryClient = useQueryClient();
  const { onMessageCreated, onMessageUpdated, onMessageDeleted } = useSocketStore();
  const { currentChannelId, currentDmThreadId } = useWorkspaceStore();
  const { incrementUnread } = useUnreadStore();
  const { user } = useAuthStore();

  useEffect(() => {
    const unsubscribeCreated = onMessageCreated((message: Message) => {
      // Don't count our own messages
      if (message.senderId === user?.id) {
        return;
      }

      // Check if this message is for the currently active channel/DM
      const isActiveChannel = message.channelId && message.channelId === currentChannelId;
      const isActiveDm = message.dmThreadId && message.dmThreadId === currentDmThreadId;

      // If not currently viewing this channel/DM, increment unread count
      if (!isActiveChannel && !isActiveDm) {
        if (message.channelId) {
          incrementUnread({ channelId: message.channelId });
        } else if (message.dmThreadId) {
          incrementUnread({ dmThreadId: message.dmThreadId });
        }
      }

      // Invalidate messages query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    });

    const unsubscribeUpdated = onMessageUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    });

    const unsubscribeDeleted = onMessageDeleted(() => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
      unsubscribeDeleted();
    };
  }, [
    onMessageCreated,
    onMessageUpdated,
    onMessageDeleted,
    currentChannelId,
    currentDmThreadId,
    incrementUnread,
    user?.id,
    queryClient,
  ]);
}
