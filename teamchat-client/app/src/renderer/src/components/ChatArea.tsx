import { useEffect, useRef, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useWorkspaceStore } from '../stores/workspace';
import { useSocketStore } from '../stores/socket';
import { useCallStore } from '../stores/call';
import { format, isToday, isYesterday } from 'date-fns';
import { Hash, Lock, Phone, Video, Search, Pin, Bookmark, Users } from 'lucide-react';
import MessageItem from './MessageItem';
import MessageComposer from './MessageComposer';
import SearchPanel from './SearchPanel';
import { MessageListSkeleton } from './ui/Skeleton';
import type { Message, Channel, DmThread } from '@teamchat/shared';

/**
 * Main chat area component displaying messages for the selected channel or DM.
 *
 * Features:
 * - Real-time message updates via Socket.io subscriptions
 * - Typing indicators for active users
 * - Date dividers between message groups
 * - Header with call buttons and panel toggles
 * - Search panel overlay
 */
export default function ChatArea() {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showSearch, setShowSearch] = useState(false);

  const {
    currentWorkspaceId,
    currentChannelId,
    currentDmThreadId,
    openPinnedMessages,
    openSavedMessages,
    openMembersPanel,
  } = useWorkspaceStore();

  const {
    joinChannel,
    leaveChannel,
    joinDm,
    leaveDm,
    onMessageCreated,
    onMessageUpdated,
    onMessageDeleted,
    typingUsers,
    onlineUsers,
  } = useSocketStore();

  const { startCall, localMediaState } = useCallStore();

  const { user } = useAuthStore();

  // Memoize scope for stable reference to prevent unnecessary re-subscriptions
  const scope = useMemo(() => {
    if (currentChannelId) return { channelId: currentChannelId };
    if (currentDmThreadId) return { dmThreadId: currentDmThreadId };
    return null;
  }, [currentChannelId, currentDmThreadId]);

  // Fetch channel or DM info
  const { data: channelData } = useQuery({
    queryKey: ['channel', currentChannelId],
    queryFn: () => api.get<{ channel: Channel }>(`/channels/${currentChannelId}`),
    enabled: !!currentChannelId,
  });

  const { data: dmData } = useQuery({
    queryKey: ['dm', currentDmThreadId],
    queryFn: () => api.get<{ dmThread: DmThread }>(`/dms/${currentDmThreadId}`),
    enabled: !!currentDmThreadId,
  });

  // Fetch messages
  const { data: messagesData, isLoading } = useQuery({
    queryKey: ['messages', scope],
    queryFn: () =>
      api.get<{ items: Message[] }>('/messages', {
        ...scope,
        limit: 50,
      }),
    enabled: !!scope,
  });

  // Join/leave socket rooms
  useEffect(() => {
    if (currentChannelId) {
      joinChannel(currentChannelId);
      return () => leaveChannel(currentChannelId);
    }
  }, [currentChannelId, joinChannel, leaveChannel]);

  useEffect(() => {
    if (currentDmThreadId) {
      joinDm(currentDmThreadId);
      return () => leaveDm(currentDmThreadId);
    }
  }, [currentDmThreadId, joinDm, leaveDm]);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubCreate = onMessageCreated((message) => {
      // Only update if message belongs to current scope
      if (
        (scope?.channelId && message.channelId === scope.channelId) ||
        (scope?.dmThreadId && message.dmThreadId === scope.dmThreadId)
      ) {
        queryClient.setQueryData(['messages', scope], (old: any) => ({
          ...old,
          items: [message, ...(old?.items || [])],
        }));
      }
    });

    const unsubUpdate = onMessageUpdated((message) => {
      queryClient.setQueryData(['messages', scope], (old: any) => ({
        ...old,
        items: old?.items?.map((m: Message) => (m.id === message.id ? message : m)) || [],
      }));
    });

    const unsubDelete = onMessageDeleted(({ messageId }) => {
      queryClient.setQueryData(['messages', scope], (old: any) => ({
        ...old,
        items: old?.items?.map((m: Message) =>
          m.id === messageId ? { ...m, isDeleted: true, body: '[Message deleted]' } : m
        ) || [],
      }));
    });

    return () => {
      unsubCreate();
      unsubUpdate();
      unsubDelete();
    };
  }, [scope, queryClient, onMessageCreated, onMessageUpdated, onMessageDeleted]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData?.items]);

  const messages = messagesData?.items || [];
  const channel = channelData?.channel;
  const dm = dmData?.dmThread;

  // Get typing users for current scope
  const currentTypingUsers = typingUsers.get(currentChannelId || currentDmThreadId || '') || [];

  /**
   * Gets the other participant in a 1:1 DM thread.
   * Returns null for group DMs or if user data is incomplete.
   */
  const getOtherUser = (dmThread: DmThread): { id: string; displayName: string } | null => {
    if (dmThread.userA?.id === user?.id) {
      return dmThread.userB || null;
    }
    return dmThread.userA || null;
  };

  const otherUser = dm ? getOtherUser(dm) : null;
  const isDmUserOnline = otherUser ? onlineUsers.has(otherUser.id) : false;

  // Get header info
  const headerTitle = channel?.name || (otherUser?.displayName || 'Select a conversation');
  const headerIcon = channel ? (
    channel.isPrivate ? <Lock className="w-5 h-5" /> : <Hash className="w-5 h-5" />
  ) : null;

  const handleStartCall = async (withVideo: boolean) => {
    try {
      await startCall(scope!, { withVideo });
    } catch (err) {
      console.error('Failed to start call:', err);
    }
  };

  if (!scope) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Select a channel or DM to start chatting
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* DM user avatar with presence */}
          {dm && otherUser && (
            <div className="relative">
              <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center text-white font-medium">
                {otherUser.displayName.charAt(0).toUpperCase()}
              </div>
              {isDmUserOnline && (
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
              )}
            </div>
          )}
          {headerIcon}
          <div>
            <h2 className="font-bold text-lg">{headerTitle}</h2>
            {dm && (
              <span className="text-xs text-gray-500">
                {isDmUserOnline ? 'Online' : 'Offline'}
              </span>
            )}
          </div>
          {channel?.description && (
            <span className="text-gray-500 text-sm ml-2">| {channel.description}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Search button */}
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
            title="Search messages (Quick switch: Cmd+K)"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search</span>
          </button>

          {/* Pinned messages (channel only) */}
          {currentChannelId && (
            <button
              onClick={openPinnedMessages}
              className="p-2 hover:bg-gray-100 rounded-lg"
              title="Pinned messages"
            >
              <Pin className="w-5 h-5 text-gray-600" />
            </button>
          )}

          {/* Saved messages */}
          <button
            onClick={openSavedMessages}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Saved messages"
          >
            <Bookmark className="w-5 h-5 text-gray-600" />
          </button>

          {/* Call buttons */}
          <button
            onClick={() => handleStartCall(false)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Start audio call"
          >
            <Phone className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={() => handleStartCall(true)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Start video call"
          >
            <Video className="w-5 h-5 text-gray-600" />
          </button>

          {/* Members panel (channel only) */}
          {currentChannelId && (
            <button
              onClick={openMembersPanel}
              className="p-2 hover:bg-gray-100 rounded-lg"
              title="View members"
            >
              <Users className="w-5 h-5 text-gray-600" />
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col-reverse">
        <div ref={messagesEndRef} />

        {isLoading ? (
          <div className="py-4">
            <MessageListSkeleton count={6} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-lg font-medium mb-1">No messages yet</p>
              <p className="text-sm">Be the first to send a message!</p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {messages
              .slice()
              .reverse()
              .map((message, idx, arr) => {
                const prevMessage = arr[idx - 1];
                const showDateDivider =
                  !prevMessage ||
                  new Date(message.createdAt).toDateString() !==
                    new Date(prevMessage.createdAt).toDateString();

                return (
                  <div key={message.id}>
                    {showDateDivider && (
                      <div className="flex items-center gap-4 my-4">
                        <div className="flex-1 h-px bg-gray-200" />
                        <span className="text-xs text-gray-500 font-medium">
                          {formatDateDivider(new Date(message.createdAt))}
                        </span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>
                    )}
                    <MessageItem message={message} />
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Typing indicator */}
      {currentTypingUsers.length > 0 && (
        <div className="px-4 py-2 text-sm text-gray-500">
          {currentTypingUsers.map((t) => t.displayName).join(', ')}{' '}
          {currentTypingUsers.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* Composer */}
      <MessageComposer
        workspaceId={currentWorkspaceId!}
        channelId={currentChannelId || undefined}
        dmThreadId={currentDmThreadId || undefined}
      />

      {/* Search panel */}
      {showSearch && <SearchPanel onClose={() => setShowSearch(false)} />}
    </div>
  );
}

function formatDateDivider(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}
