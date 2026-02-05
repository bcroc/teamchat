import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/workspace';
import { toast } from '../stores/toast';
import { Clock, X, Send, Trash2, Edit2 } from 'lucide-react';

interface ScheduledMessage {
  id: string;
  body: string;
  scheduledAt: string;
  status: string;
  channelId?: string;
  dmThreadId?: string;
}

interface ScheduledMessagesPanelProps {
  onClose: () => void;
}

export default function ScheduledMessagesPanel({ onClose }: ScheduledMessagesPanelProps) {
  const queryClient = useQueryClient();
  const { currentWorkspaceId } = useWorkspaceStore();

  const { data, isLoading } = useQuery({
    queryKey: ['scheduled', currentWorkspaceId],
    queryFn: () =>
      api.get<{ scheduledMessages: ScheduledMessage[] }>('/scheduled', {
        workspaceId: currentWorkspaceId!,
      }),
    enabled: !!currentWorkspaceId,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/scheduled/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled'] });
      toast.success('Scheduled message cancelled');
    },
    onError: () => {
      toast.error('Failed to cancel');
    },
  });

  const sendNowMutation = useMutation({
    mutationFn: (id: string) => api.post(`/scheduled/${id}/send-now`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('Message sent');
    },
    onError: () => {
      toast.error('Failed to send');
    },
  });

  const scheduledMessages = data?.scheduledMessages || [];

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="w-80 border-l bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold">Scheduled Messages</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-gray-500">Loading...</div>
        ) : scheduledMessages.length === 0 ? (
          <div className="p-8 text-center">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No scheduled messages</p>
            <p className="text-gray-400 text-xs mt-1">
              Click the clock icon in the composer to schedule a message
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {scheduledMessages.map((msg) => (
              <div key={msg.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>{formatTime(msg.scheduledAt)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => sendNowMutation.mutate(msg.id)}
                      disabled={sendNowMutation.isPending}
                      className="p-1.5 hover:bg-green-100 rounded text-green-600"
                      title="Send now"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => cancelMutation.mutate(msg.id)}
                      disabled={cancelMutation.isPending}
                      className="p-1.5 hover:bg-red-100 rounded text-red-500"
                      title="Cancel"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-800 line-clamp-3">{msg.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t bg-gray-50">
        <p className="text-xs text-gray-500">
          {scheduledMessages.length} message{scheduledMessages.length !== 1 ? 's' : ''} scheduled
        </p>
      </div>
    </div>
  );
}
