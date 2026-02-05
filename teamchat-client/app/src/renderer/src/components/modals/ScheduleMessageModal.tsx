import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from '../../stores/toast';
import { X, Clock, Calendar, Send } from 'lucide-react';
import { clsx } from 'clsx';

interface ScheduleMessageModalProps {
  workspaceId: string;
  channelId?: string;
  dmThreadId?: string;
  initialMessage?: string;
  onClose: () => void;
  onScheduled?: () => void;
}

const quickOptions = [
  { label: 'In 30 minutes', getTime: () => new Date(Date.now() + 30 * 60 * 1000) },
  { label: 'In 1 hour', getTime: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: 'In 3 hours', getTime: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
  { label: 'Tomorrow at 9 AM', getTime: () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }},
  { label: 'Monday at 9 AM', getTime: () => {
    const d = new Date();
    const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    d.setHours(9, 0, 0, 0);
    return d;
  }},
];

export default function ScheduleMessageModal({
  workspaceId,
  channelId,
  dmThreadId,
  initialMessage = '',
  onClose,
  onScheduled,
}: ScheduleMessageModalProps) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [message, setMessage] = useState(initialMessage);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const scheduleMutation = useMutation({
    mutationFn: () =>
      api.post('/scheduled', {
        workspaceId,
        channelId,
        dmThreadId,
        body: message,
        scheduledAt: scheduledAt?.toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled', workspaceId] });
      toast.success('Message scheduled');
      onScheduled?.();
      onClose();
    },
    onError: () => {
      toast.error('Failed to schedule message');
    },
  });

  const handleQuickOption = (getTime: () => Date) => {
    setScheduledAt(getTime());
    setShowCustom(false);
  };

  const handleCustomDateTime = () => {
    if (customDate && customTime) {
      const dateTime = new Date(`${customDate}T${customTime}`);
      if (dateTime > new Date()) {
        setScheduledAt(dateTime);
      } else {
        toast.error('Please select a future date and time');
      }
    }
  };

  const handleSchedule = () => {
    if (!message.trim()) {
      toast.error('Please enter a message');
      return;
    }
    if (!scheduledAt) {
      toast.error('Please select a time');
      return;
    }
    scheduleMutation.mutate();
  };

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const formatDateTime = (date: Date) => {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-modal-backdrop">
      <div
        ref={containerRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden animate-modal-enter"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-bold">Schedule Message</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Message input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none h-24"
            />
          </div>

          {/* Quick options */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Send at
            </label>
            <div className="grid grid-cols-2 gap-2">
              {quickOptions.map((option) => (
                <button
                  key={option.label}
                  onClick={() => handleQuickOption(option.getTime)}
                  className={clsx(
                    'px-3 py-2 border rounded-lg text-sm text-left hover:bg-gray-50 transition-colors',
                    scheduledAt?.getTime() === option.getTime().getTime() && 'border-primary-500 bg-primary-50'
                  )}
                >
                  {option.label}
                </button>
              ))}
              <button
                onClick={() => setShowCustom(!showCustom)}
                className={clsx(
                  'px-3 py-2 border rounded-lg text-sm text-left hover:bg-gray-50 transition-colors flex items-center gap-2',
                  showCustom && 'border-primary-500 bg-primary-50'
                )}
              >
                <Calendar className="w-4 h-4" />
                Custom time
              </button>
            </div>
          </div>

          {/* Custom date/time picker */}
          {showCustom && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <button
                onClick={handleCustomDateTime}
                className="mt-3 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300 w-full"
              >
                Set custom time
              </button>
            </div>
          )}

          {/* Selected time display */}
          {scheduledAt && (
            <div className="mb-4 p-3 bg-primary-50 rounded-lg flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary-600" />
              <span className="text-sm text-primary-700">
                Scheduled for {formatDateTime(scheduledAt)}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSchedule}
            disabled={!message.trim() || !scheduledAt || scheduleMutation.isPending}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {scheduleMutation.isPending ? 'Scheduling...' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
