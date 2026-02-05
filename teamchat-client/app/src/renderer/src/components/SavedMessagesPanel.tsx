import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { X, Bookmark, Trash2, Hash, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '../stores/toast';
import { useWorkspaceStore } from '../stores/workspace';
import MessageContent from './MessageContent';
import type { SavedMessage, Message, User, Channel } from '@teamchat/shared';

interface SavedMessagesPanelProps {
  onClose: () => void;
}

interface SavedMessageWithDetails extends SavedMessage {
  message: Message & {
    sender: Pick<User, 'id' | 'displayName' | 'avatarUrl'>;
    channel?: Pick<Channel, 'id' | 'name'>;
    dmThread?: { id: string };
  };
}

export default function SavedMessagesPanel({ onClose }: SavedMessagesPanelProps) {
  const queryClient = useQueryClient();
  const { setCurrentChannel } = useWorkspaceStore();

  const { data, isLoading, error } = useQuery({
    queryKey: ['saved-messages'],
    queryFn: () =>
      api.get<{ items: SavedMessageWithDetails[]; hasMore: boolean; nextCursor: string | null }>(
        '/saved'
      ),
  });

  const unsaveMutation = useMutation({
    mutationFn: (messageId: string) => api.delete(`/saved/${messageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-messages'] });
      toast.success('Message removed from saved');
    },
    onError: () => {
      toast.error('Failed to remove message');
    },
  });

  const handleUnsave = (messageId: string) => {
    unsaveMutation.mutate(messageId);
  };

  const handleJumpToMessage = (saved: SavedMessageWithDetails) => {
    if (saved.message.channel) {
      setCurrentChannel(saved.message.channel.id);
      // TODO: Scroll to message
    }
    onClose();
  };

  const savedMessages = data?.items || [];

  return (
    <div className="h-full flex flex-col bg-white border-l w-80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold">Saved Messages</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Info */}
      <div className="px-4 py-2 bg-gray-50 border-b text-sm text-gray-600">
        Your personal collection of saved messages
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
            Failed to load saved messages
          </div>
        )}

        {!isLoading && savedMessages.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <Bookmark className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="font-medium">No saved messages</p>
            <p className="text-sm mt-1">
              Save messages you want to come back to later
            </p>
          </div>
        )}

        {savedMessages.map((saved) => (
          <div
            key={saved.id}
            className="px-4 py-3 border-b hover:bg-gray-50 group cursor-pointer"
            onClick={() => handleJumpToMessage(saved)}
          >
            {/* Location info */}
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
              {saved.message.channel ? (
                <>
                  <Hash className="w-3 h-3" />
                  <span>{saved.message.channel.name}</span>
                </>
              ) : (
                <>
                  <MessageSquare className="w-3 h-3" />
                  <span>Direct message</span>
                </>
              )}
            </div>

            {/* Sender info */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-primary-500 flex items-center justify-center text-white text-xs font-medium">
                  {saved.message.sender?.displayName?.charAt(0).toUpperCase() || '?'}
                </div>
                <span className="font-medium text-sm">
                  {saved.message.sender?.displayName || 'Unknown'}
                </span>
                <span className="text-xs text-gray-500">
                  {format(new Date(saved.message.createdAt), 'MMM d, h:mm a')}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnsave(saved.messageId);
                }}
                className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove from saved"
              >
                <Trash2 className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Message content */}
            <div className="text-sm text-gray-700 line-clamp-3">
              <MessageContent content={saved.message.body} />
            </div>

            {/* Note if present */}
            {saved.note && (
              <div className="mt-2 text-xs text-primary-600 italic">
                Note: {saved.note}
              </div>
            )}

            {/* Saved date */}
            <div className="mt-2 text-xs text-gray-400">
              Saved {format(new Date(saved.savedAt), 'MMM d, yyyy')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
