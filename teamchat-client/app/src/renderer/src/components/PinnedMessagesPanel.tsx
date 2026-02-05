import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { X, Pin, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '../stores/toast';
import MessageContent from './MessageContent';
import type { PinnedMessage, Message, User } from '@teamchat/shared';

interface PinnedMessagesPanelProps {
  channelId: string;
  channelName: string;
  onClose: () => void;
}

interface PinnedMessageWithDetails extends PinnedMessage {
  message: Message & {
    sender: Pick<User, 'id' | 'displayName' | 'avatarUrl'>;
  };
  pinner: Pick<User, 'id' | 'displayName'>;
}

export default function PinnedMessagesPanel({
  channelId,
  channelName,
  onClose,
}: PinnedMessagesPanelProps) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['pinned-messages', channelId],
    queryFn: () =>
      api.get<{ pinnedMessages: PinnedMessageWithDetails[] }>(`/pins/${channelId}`),
  });

  const unpinMutation = useMutation({
    mutationFn: (messageId: string) => api.delete(`/pins/${channelId}/${messageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pinned-messages', channelId] });
      toast.success('Message unpinned');
    },
    onError: () => {
      toast.error('Failed to unpin message');
    },
  });

  const handleUnpin = (messageId: string) => {
    if (confirm('Are you sure you want to unpin this message?')) {
      unpinMutation.mutate(messageId);
    }
  };

  const pinnedMessages = data?.pinnedMessages || [];

  return (
    <div className="h-full flex flex-col bg-white border-l w-80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Pin className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold">Pinned Messages</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Channel info */}
      <div className="px-4 py-2 bg-gray-50 border-b text-sm text-gray-600">
        #{channelName}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-red-500">
            Failed to load pinned messages
          </div>
        )}

        {!isLoading && pinnedMessages.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <Pin className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="font-medium">No pinned messages</p>
            <p className="text-sm mt-1">
              Pin important messages to keep them handy
            </p>
          </div>
        )}

        {pinnedMessages.map((pin) => (
          <div
            key={pin.id}
            className="px-4 py-3 border-b hover:bg-gray-50 group"
          >
            {/* Sender info */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-primary-500 flex items-center justify-center text-white text-xs font-medium">
                  {pin.message.sender?.displayName?.charAt(0).toUpperCase() || '?'}
                </div>
                <span className="font-medium text-sm">
                  {pin.message.sender?.displayName || 'Unknown'}
                </span>
                <span className="text-xs text-gray-500">
                  {format(new Date(pin.message.createdAt), 'MMM d, h:mm a')}
                </span>
              </div>
              <button
                onClick={() => handleUnpin(pin.messageId)}
                className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Unpin"
              >
                <Trash2 className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Message content */}
            <div className="text-sm text-gray-700 line-clamp-3">
              <MessageContent content={pin.message.body} />
            </div>

            {/* Pinned by info */}
            <div className="mt-2 text-xs text-gray-400">
              Pinned by {pin.pinner?.displayName || 'Unknown'} on{' '}
              {format(new Date(pin.pinnedAt), 'MMM d, yyyy')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
