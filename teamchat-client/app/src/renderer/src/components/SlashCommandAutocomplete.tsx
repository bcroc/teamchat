import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useWorkspaceStore } from '../stores/workspace';
import { toast } from '../stores/toast';
import {
  Smile,
  User,
  Bell,
  BellOff,
  LogOut,
  Trash2,
  Clock,
  MinusCircle,
  Circle,
  Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { UserStatus } from '@teamchat/shared';

interface SlashCommandAutocompleteProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (result: SlashCommandResult) => void;
  onClose: () => void;
}

export interface SlashCommandResult {
  type: 'insert' | 'action' | 'clear';
  text?: string; // Text to insert
  actionComplete?: boolean; // Whether the action was completed
}

interface SlashCommand {
  name: string;
  description: string;
  icon: React.ReactNode;
  usage?: string;
  execute: (args: string) => SlashCommandResult | Promise<SlashCommandResult>;
}

export default function SlashCommandAutocomplete({
  query,
  position,
  onSelect,
  onClose,
}: SlashCommandAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [executing, setExecuting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { user, updateUser } = useAuthStore();
  const { currentChannelId, currentWorkspaceId } = useWorkspaceStore();

  // Status mutation
  const updateStatusMutation = useMutation({
    mutationFn: (data: { status: UserStatus; customStatus?: string | null }) =>
      api.patch<{ user: typeof user }>('/users/me/status', data),
    onSuccess: (data) => {
      if (data.user) {
        updateUser(data.user);
      }
    },
  });

  // Define all available commands
  const commands: SlashCommand[] = [
    {
      name: 'shrug',
      description: 'Append ¯\\_(ツ)_/¯ to your message',
      icon: <Smile className="w-4 h-4" />,
      execute: () => ({ type: 'insert', text: '¯\\_(ツ)_/¯' }),
    },
    {
      name: 'tableflip',
      description: 'Append (╯°□°)╯︵ ┻━┻ to your message',
      icon: <Smile className="w-4 h-4" />,
      execute: () => ({ type: 'insert', text: '(╯°□°)╯︵ ┻━┻' }),
    },
    {
      name: 'unflip',
      description: 'Append ┬─┬ノ( º _ ºノ) to your message',
      icon: <Smile className="w-4 h-4" />,
      execute: () => ({ type: 'insert', text: '┬─┬ノ( º _ ºノ)' }),
    },
    {
      name: 'lenny',
      description: 'Append ( ͡° ͜ʖ ͡°) to your message',
      icon: <Smile className="w-4 h-4" />,
      execute: () => ({ type: 'insert', text: '( ͡° ͜ʖ ͡°)' }),
    },
    {
      name: 'active',
      description: 'Set your status to active',
      icon: <Circle className="w-4 h-4 text-green-500" />,
      execute: async () => {
        await updateStatusMutation.mutateAsync({ status: 'active' });
        toast.success('Status set to active');
        return { type: 'clear', actionComplete: true };
      },
    },
    {
      name: 'away',
      description: 'Set your status to away',
      icon: <Clock className="w-4 h-4 text-yellow-500" />,
      execute: async () => {
        await updateStatusMutation.mutateAsync({ status: 'away' });
        toast.success('Status set to away');
        return { type: 'clear', actionComplete: true };
      },
    },
    {
      name: 'dnd',
      description: 'Set your status to do not disturb',
      icon: <MinusCircle className="w-4 h-4 text-red-500" />,
      execute: async () => {
        await updateStatusMutation.mutateAsync({ status: 'dnd' });
        toast.success('Status set to do not disturb');
        return { type: 'clear', actionComplete: true };
      },
    },
    {
      name: 'status',
      description: 'Set a custom status message',
      icon: <User className="w-4 h-4" />,
      usage: '/status [your status message]',
      execute: async (args) => {
        if (!args.trim()) {
          toast.error('Please provide a status message');
          return { type: 'action', actionComplete: false };
        }
        await updateStatusMutation.mutateAsync({
          status: user?.status as UserStatus || 'active',
          customStatus: args.trim(),
        });
        toast.success('Custom status set');
        return { type: 'clear', actionComplete: true };
      },
    },
    {
      name: 'clear',
      description: 'Clear your custom status',
      icon: <Trash2 className="w-4 h-4" />,
      execute: async () => {
        await updateStatusMutation.mutateAsync({
          status: user?.status as UserStatus || 'active',
          customStatus: null,
        });
        toast.success('Custom status cleared');
        return { type: 'clear', actionComplete: true };
      },
    },
    {
      name: 'me',
      description: 'Display action text in third person',
      icon: <User className="w-4 h-4" />,
      usage: '/me [action]',
      execute: (args) => {
        if (!args.trim()) {
          return { type: 'action', actionComplete: false };
        }
        return { type: 'insert', text: `_${args.trim()}_` };
      },
    },
    {
      name: 'giphy',
      description: 'Search for a GIF (coming soon)',
      icon: <Zap className="w-4 h-4 text-purple-500" />,
      usage: '/giphy [search term]',
      execute: () => {
        toast.info('GIF search coming soon!');
        return { type: 'clear', actionComplete: true };
      },
    },
    {
      name: 'remind',
      description: 'Set a reminder',
      icon: <Bell className="w-4 h-4 text-orange-500" />,
      usage: '/remind [time] to [task]',
      execute: async (args) => {
        if (!args.trim()) {
          toast.info('Use: /remind in 30 minutes to check the build');
          return { type: 'action', actionComplete: false };
        }
        try {
          // Parse and create the reminder
          const parseResult = await api.post<{ parsed: { text: string; remindAt: string } }>(
            '/reminders/parse',
            { input: args, workspaceId: currentWorkspaceId }
          );

          await api.post('/reminders', {
            workspaceId: currentWorkspaceId,
            text: parseResult.parsed.text,
            remindAt: parseResult.parsed.remindAt,
          });

          toast.success(`Reminder set for ${new Date(parseResult.parsed.remindAt).toLocaleString()}`);
          return { type: 'clear', actionComplete: true };
        } catch (error: any) {
          toast.error(error.message || 'Could not parse reminder');
          return { type: 'action', actionComplete: false };
        }
      },
    },
    {
      name: 'mute',
      description: 'Mute the current channel',
      icon: <BellOff className="w-4 h-4 text-gray-500" />,
      usage: '/mute [duration: 1h, 8h, 24h, 1w]',
      execute: async (args) => {
        if (!currentChannelId) {
          toast.error('No channel selected');
          return { type: 'action', actionComplete: false };
        }
        const duration = args.trim() || undefined;
        try {
          await api.post(`/preferences/channels/${currentChannelId}/mute`, { duration });
          toast.success(duration ? `Channel muted for ${duration}` : 'Channel muted');
          return { type: 'clear', actionComplete: true };
        } catch {
          toast.error('Failed to mute channel');
          return { type: 'action', actionComplete: false };
        }
      },
    },
    {
      name: 'unmute',
      description: 'Unmute the current channel',
      icon: <Bell className="w-4 h-4 text-green-500" />,
      execute: async () => {
        if (!currentChannelId) {
          toast.error('No channel selected');
          return { type: 'action', actionComplete: false };
        }
        try {
          await api.post(`/preferences/channels/${currentChannelId}/unmute`, {});
          toast.success('Channel unmuted');
          return { type: 'clear', actionComplete: true };
        } catch {
          toast.error('Failed to unmute channel');
          return { type: 'action', actionComplete: false };
        }
      },
    },
  ];

  // Parse command and args from query
  const parseQuery = (q: string) => {
    const parts = q.split(' ');
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');
    return { commandName, args };
  };

  const { commandName, args } = parseQuery(query);

  // Filter commands based on query
  const filteredCommands = commands.filter((cmd) =>
    cmd.name.toLowerCase().startsWith(commandName)
  );

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle command execution
  const executeCommand = async (command: SlashCommand) => {
    setExecuting(true);
    try {
      const result = await command.execute(args);
      onSelect(result);
    } catch (error) {
      toast.error('Command failed');
      onClose();
    } finally {
      setExecuting(false);
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredCommands.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            executeCommand(filteredCommands[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, selectedIndex, onClose, args]);

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

  if (filteredCommands.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="absolute bg-white rounded-lg shadow-xl border z-50 py-2 min-w-[300px] max-h-[350px] overflow-y-auto animate-slide-up"
      style={{ bottom: position.top, left: position.left }}
    >
      <div className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase flex items-center gap-2">
        <Zap className="w-3 h-3" />
        Slash Commands
      </div>
      {filteredCommands.map((command, index) => (
        <button
          key={command.name}
          onClick={() => executeCommand(command)}
          onMouseEnter={() => setSelectedIndex(index)}
          disabled={executing}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
            index === selectedIndex ? 'bg-primary-50' : 'hover:bg-gray-50',
            executing && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
            {command.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">/{command.name}</span>
              {command.usage && (
                <span className="text-xs text-gray-400">{command.usage}</span>
              )}
            </div>
            <div className="text-sm text-gray-500 truncate">{command.description}</div>
          </div>
        </button>
      ))}
      {filteredCommands.length > 0 && commandName && (
        <div className="px-3 py-2 text-xs text-gray-400 border-t mt-1">
          Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">Enter</kbd> or{' '}
          <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">Tab</kbd> to run command
        </div>
      )}
    </div>
  );
}
