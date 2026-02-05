import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/workspace';
import { toast } from '../stores/toast';
import { Bell, X, Check, Clock, Trash2, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';

interface Reminder {
  id: string;
  text: string;
  remindAt: string;
  status: string;
  createdAt: string;
}

interface RemindersPanelProps {
  onClose: () => void;
}

export default function RemindersPanel({ onClose }: RemindersPanelProps) {
  const queryClient = useQueryClient();
  const { currentWorkspaceId } = useWorkspaceStore();
  const [filter, setFilter] = useState<'pending' | 'completed' | 'all'>('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['reminders', currentWorkspaceId, filter],
    queryFn: () =>
      api.get<{ reminders: Reminder[] }>('/reminders', {
        workspaceId: currentWorkspaceId!,
        status: filter,
      }),
    enabled: !!currentWorkspaceId,
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/reminders/${id}/complete`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Reminder completed');
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => api.post(`/reminders/${id}/dismiss`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/reminders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Reminder deleted');
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, duration }: { id: string; duration: string }) =>
      api.post(`/reminders/${id}/snooze`, { duration }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Reminder snoozed');
    },
  });

  const reminders = data?.reminders || [];

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    if (diff < 0) {
      return 'Overdue';
    }

    if (diff < 60 * 60 * 1000) {
      const mins = Math.round(diff / (60 * 1000));
      return `In ${mins} min${mins !== 1 ? 's' : ''}`;
    }

    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.round(diff / (60 * 60 * 1000));
      return `In ${hours} hour${hours !== 1 ? 's' : ''}`;
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="w-80 border-l bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold">Reminders</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b">
        {(['pending', 'completed', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'flex-1 py-2 text-sm font-medium capitalize',
              filter === f
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Reminders list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-gray-500">Loading...</div>
        ) : reminders.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No {filter} reminders</p>
            <p className="text-gray-400 text-xs mt-1">
              Use /remind to set a reminder
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className={clsx(
                  'p-4 hover:bg-gray-50',
                  reminder.status === 'completed' && 'opacity-60'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p
                      className={clsx(
                        'text-sm',
                        reminder.status === 'completed' && 'line-through text-gray-500'
                      )}
                    >
                      {reminder.text}
                    </p>
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                      <Clock className="w-3 h-3" />
                      <span>{formatTime(reminder.remindAt)}</span>
                    </div>
                  </div>

                  {reminder.status === 'pending' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => completeMutation.mutate(reminder.id)}
                        className="p-1.5 hover:bg-green-100 rounded text-green-600"
                        title="Complete"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => snoozeMutation.mutate({ id: reminder.id, duration: 'in 30 minutes' })}
                        className="p-1.5 hover:bg-blue-100 rounded text-blue-600"
                        title="Snooze 30 min"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => dismissMutation.mutate(reminder.id)}
                        className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
                        title="Dismiss"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {reminder.status !== 'pending' && (
                    <button
                      onClick={() => deleteMutation.mutate(reminder.id)}
                      className="p-1.5 hover:bg-red-100 rounded text-red-500"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t bg-gray-50">
        <p className="text-xs text-gray-500">
          Tip: Use <code className="px-1 py-0.5 bg-gray-200 rounded">/remind</code> in chat to set reminders
        </p>
      </div>
    </div>
  );
}
