import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api } from '../lib/api';

interface UnreadCounts {
  channels: Record<string, number>;
  dms: Record<string, number>;
}

interface UnreadState {
  counts: UnreadCounts;
  lastReadTimestamps: Record<string, string>; // channelId/dmThreadId -> ISO timestamp

  // Actions
  incrementUnread: (scope: { channelId?: string; dmThreadId?: string }) => void;
  markAsRead: (scope: { channelId?: string; dmThreadId?: string }, messageId?: string) => void;
  resetUnread: (scope: { channelId?: string; dmThreadId?: string }) => void;
  getUnreadCount: (scope: { channelId?: string; dmThreadId?: string }) => number;
  getTotalUnread: () => number;
  syncUnreadFromServer: (workspaceId: string) => Promise<void>;
}

export const useUnreadStore = create<UnreadState>()(
  persist(
    (set, get) => ({
      counts: {
        channels: {},
        dms: {},
      },
      lastReadTimestamps: {},

      incrementUnread: (scope) => {
        set((state) => {
          const newCounts = { ...state.counts };

          if (scope.channelId) {
            newCounts.channels = {
              ...newCounts.channels,
              [scope.channelId]: (newCounts.channels[scope.channelId] || 0) + 1,
            };
          } else if (scope.dmThreadId) {
            newCounts.dms = {
              ...newCounts.dms,
              [scope.dmThreadId]: (newCounts.dms[scope.dmThreadId] || 0) + 1,
            };
          }

          return { counts: newCounts };
        });
      },

      markAsRead: async (scope, messageId) => {
        const key = scope.channelId || scope.dmThreadId;
        if (!key) return;

        set((state) => {
          const newCounts = { ...state.counts };
          const newTimestamps = { ...state.lastReadTimestamps };

          if (scope.channelId) {
            newCounts.channels = {
              ...newCounts.channels,
              [scope.channelId]: 0,
            };
          } else if (scope.dmThreadId) {
            newCounts.dms = {
              ...newCounts.dms,
              [scope.dmThreadId]: 0,
            };
          }

          newTimestamps[key] = new Date().toISOString();

          return { counts: newCounts, lastReadTimestamps: newTimestamps };
        });

        // Update read receipt on server
        if (messageId) {
          try {
            await api.post('/messages/reads', {
              channelId: scope.channelId,
              dmThreadId: scope.dmThreadId,
              lastReadMessageId: messageId,
            });
          } catch {
            // Silently fail - not critical
          }
        }
      },

      resetUnread: (scope) => {
        set((state) => {
          const newCounts = { ...state.counts };

          if (scope.channelId) {
            newCounts.channels = {
              ...newCounts.channels,
              [scope.channelId]: 0,
            };
          } else if (scope.dmThreadId) {
            newCounts.dms = {
              ...newCounts.dms,
              [scope.dmThreadId]: 0,
            };
          }

          return { counts: newCounts };
        });
      },

      getUnreadCount: (scope) => {
        const state = get();
        if (scope.channelId) {
          return state.counts.channels[scope.channelId] || 0;
        } else if (scope.dmThreadId) {
          return state.counts.dms[scope.dmThreadId] || 0;
        }
        return 0;
      },

      getTotalUnread: () => {
        const state = get();
        const channelTotal = Object.values(state.counts.channels).reduce((a, b) => a + b, 0);
        const dmTotal = Object.values(state.counts.dms).reduce((a, b) => a + b, 0);
        return channelTotal + dmTotal;
      },

      syncUnreadFromServer: async (workspaceId: string) => {
        try {
          const response = await api.get<{
            unreadCounts: Array<{
              channelId?: string;
              dmThreadId?: string;
              count: number;
            }>;
          }>('/messages/unread', { workspaceId });

          set((state) => {
            const newCounts: UnreadCounts = {
              channels: {},
              dms: {},
            };

            for (const item of response.unreadCounts) {
              if (item.channelId) {
                newCounts.channels[item.channelId] = item.count;
              } else if (item.dmThreadId) {
                newCounts.dms[item.dmThreadId] = item.count;
              }
            }

            return { counts: newCounts };
          });
        } catch {
          // Use local counts on failure
        }
      },
    }),
    {
      name: 'teamchat-unread',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        counts: state.counts,
        lastReadTimestamps: state.lastReadTimestamps,
      }),
    }
  )
);
