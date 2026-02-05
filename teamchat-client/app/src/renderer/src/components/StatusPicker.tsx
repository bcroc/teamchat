import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { toast } from '../stores/toast';
import { Circle, Clock, MinusCircle, Eye, X, Smile } from 'lucide-react';
import { clsx } from 'clsx';
import type { UserStatus } from '@teamchat/shared';

interface StatusPickerProps {
  onClose: () => void;
}

interface StatusOption {
  value: UserStatus;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const statusOptions: StatusOption[] = [
  {
    value: 'active',
    label: 'Active',
    description: 'You appear online to others',
    icon: <Circle className="w-3 h-3 fill-current" />,
    color: 'text-green-500',
  },
  {
    value: 'away',
    label: 'Away',
    description: 'Temporarily away from your desk',
    icon: <Clock className="w-3.5 h-3.5" />,
    color: 'text-yellow-500',
  },
  {
    value: 'dnd',
    label: 'Do not disturb',
    description: 'Mutes notifications',
    icon: <MinusCircle className="w-3.5 h-3.5" />,
    color: 'text-red-500',
  },
  {
    value: 'invisible',
    label: 'Invisible',
    description: 'Appear offline to others',
    icon: <Eye className="w-3.5 h-3.5" />,
    color: 'text-gray-500',
  },
];

const quickStatuses = [
  { emoji: '🏠', text: 'Working from home' },
  { emoji: '🍔', text: 'Lunch break' },
  { emoji: '🏃', text: 'Away for a bit' },
  { emoji: '📅', text: 'In a meeting' },
  { emoji: '🤒', text: 'Out sick' },
  { emoji: '🌴', text: 'On vacation' },
];

export default function StatusPicker({ onClose }: StatusPickerProps) {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [customStatus, setCustomStatus] = useState(user?.customStatus || '');

  const updateStatusMutation = useMutation({
    mutationFn: (data: { status: UserStatus; customStatus?: string | null }) =>
      api.patch<{ user: typeof user }>('/users/me/status', data),
    onSuccess: (data) => {
      if (data.user) {
        updateUser(data.user);
      }
      toast.success('Status updated');
      onClose();
    },
    onError: () => {
      toast.error('Failed to update status');
    },
  });

  const clearStatusMutation = useMutation({
    mutationFn: () => api.delete('/users/me/status'),
    onSuccess: () => {
      updateUser({ ...user!, customStatus: null, statusExpiry: null });
      setCustomStatus('');
      toast.success('Custom status cleared');
    },
    onError: () => {
      toast.error('Failed to clear status');
    },
  });

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

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleStatusChange = (status: UserStatus) => {
    updateStatusMutation.mutate({ status, customStatus: customStatus || null });
  };

  const handleQuickStatus = (text: string) => {
    setCustomStatus(text);
    updateStatusMutation.mutate({
      status: user?.status || 'active',
      customStatus: text,
    });
  };

  const handleSetCustomStatus = () => {
    if (customStatus.trim()) {
      updateStatusMutation.mutate({
        status: user?.status || 'active',
        customStatus: customStatus.trim(),
      });
    }
  };

  const currentStatus = statusOptions.find((s) => s.value === user?.status) || statusOptions[0];

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-xl border w-80 z-50 animate-slide-down"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold">Set your status</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Current status display */}
      <div className="px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <span className={currentStatus.color}>{currentStatus.icon}</span>
          <span className="font-medium">{currentStatus.label}</span>
        </div>
        {user?.customStatus && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-600">{user.customStatus}</span>
            <button
              onClick={() => clearStatusMutation.mutate()}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Status options */}
      <div className="py-2">
        <div className="px-4 py-1 text-xs font-medium text-gray-500 uppercase">Status</div>
        {statusOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => handleStatusChange(option.value)}
            className={clsx(
              'w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors text-left',
              option.value === user?.status && 'bg-primary-50'
            )}
          >
            <span className={option.color}>{option.icon}</span>
            <div className="flex-1">
              <div className="font-medium text-sm">{option.label}</div>
              <div className="text-xs text-gray-500">{option.description}</div>
            </div>
            {option.value === user?.status && (
              <span className="w-2 h-2 rounded-full bg-primary-500" />
            )}
          </button>
        ))}
      </div>

      {/* Custom status input */}
      <div className="px-4 py-3 border-t">
        <div className="flex items-center gap-2">
          <Smile className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={customStatus}
            onChange={(e) => setCustomStatus(e.target.value)}
            placeholder="What's your status?"
            className="flex-1 text-sm outline-none"
            maxLength={100}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSetCustomStatus();
              }
            }}
          />
          {customStatus && (
            <button
              onClick={handleSetCustomStatus}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Set
            </button>
          )}
        </div>
      </div>

      {/* Quick statuses */}
      <div className="px-4 py-3 border-t bg-gray-50">
        <div className="text-xs font-medium text-gray-500 uppercase mb-2">Quick set</div>
        <div className="flex flex-wrap gap-2">
          {quickStatuses.map((qs, index) => (
            <button
              key={index}
              onClick={() => handleQuickStatus(`${qs.emoji} ${qs.text}`)}
              className="flex items-center gap-1 px-2 py-1 bg-white border rounded-full text-sm hover:bg-gray-50 transition-colors"
            >
              <span>{qs.emoji}</span>
              <span className="text-gray-700">{qs.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
