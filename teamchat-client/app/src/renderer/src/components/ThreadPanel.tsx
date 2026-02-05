import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/workspace';
import { X } from 'lucide-react';
import MessageItem from './MessageItem';
import MessageComposer from './MessageComposer';
import type { Message } from '@teamchat/shared';

interface ThreadPanelProps {
  parentId: string;
}

export default function ThreadPanel({ parentId }: ThreadPanelProps) {
  const { currentWorkspaceId, currentChannelId, currentDmThreadId, closeThread } =
    useWorkspaceStore();

  const scope = currentChannelId
    ? { channelId: currentChannelId }
    : currentDmThreadId
    ? { dmThreadId: currentDmThreadId }
    : null;

  // Fetch parent message
  const { data: parentData } = useQuery({
    queryKey: ['message', parentId],
    queryFn: () => api.get<{ message: Message }>(`/messages/${parentId}`),
  });

  // Fetch replies
  const { data: repliesData, isLoading } = useQuery({
    queryKey: ['messages', { ...scope, parentId }],
    queryFn: () =>
      api.get<{ items: Message[] }>('/messages', {
        ...scope,
        parentId,
        limit: 50,
      }),
    enabled: !!scope,
  });

  const parentMessage = parentData?.message;
  const replies = repliesData?.items || [];

  return (
    <div className="w-96 border-l flex flex-col bg-gray-50">
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-4 bg-white">
        <h3 className="font-bold">Thread</h3>
        <button
          onClick={closeThread}
          className="p-1.5 hover:bg-gray-100 rounded"
          title="Close thread"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>
      </header>

      {/* Parent message */}
      {parentMessage && (
        <div className="border-b bg-white">
          <MessageItem message={parentMessage} isThread />
        </div>
      )}

      {/* Replies */}
      <div className="flex-1 overflow-y-auto p-4 bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          </div>
        ) : replies.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p>No replies yet</p>
            <p className="text-sm">Be the first to reply!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {replies
              .slice()
              .reverse()
              .map((reply) => (
                <MessageItem key={reply.id} message={reply} isThread />
              ))}
          </div>
        )}
      </div>

      {/* Reply composer */}
      <div className="bg-white">
        <MessageComposer
          workspaceId={currentWorkspaceId!}
          channelId={currentChannelId || undefined}
          dmThreadId={currentDmThreadId || undefined}
          parentId={parentId}
          placeholder="Reply in thread..."
        />
      </div>
    </div>
  );
}
