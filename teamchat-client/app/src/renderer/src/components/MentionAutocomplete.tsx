import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/workspace';
import { useSocketStore } from '../stores/socket';
import { AtSign, Hash, Users } from 'lucide-react';
import { clsx } from 'clsx';

interface MentionAutocompleteProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (mention: MentionItem) => void;
  onClose: () => void;
}

export interface MentionItem {
  type: 'user' | 'channel' | 'special';
  id: string;
  displayName: string;
  value: string; // The text to insert
}

interface User {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

interface Channel {
  id: string;
  name: string;
  isPrivate: boolean;
}

export default function MentionAutocomplete({
  query,
  position,
  onSelect,
  onClose,
}: MentionAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { currentWorkspaceId, currentChannelId } = useWorkspaceStore();
  const { onlineUsers } = useSocketStore();

  // Fetch workspace members
  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', currentWorkspaceId],
    queryFn: () =>
      api.get<{ members: Array<{ user: User; role: string }> }>(
        `/workspaces/${currentWorkspaceId}/members`
      ),
    enabled: !!currentWorkspaceId,
  });

  // Fetch channels
  const { data: channelsData } = useQuery({
    queryKey: ['channels', currentWorkspaceId],
    queryFn: () =>
      api.get<{ channels: Channel[] }>('/channels', { workspaceId: currentWorkspaceId! }),
    enabled: !!currentWorkspaceId,
  });

  // Build suggestions
  const suggestions: MentionItem[] = [];

  // Special mentions
  const specialMentions: MentionItem[] = [
    { type: 'special', id: 'channel', displayName: 'channel', value: '@channel' },
    { type: 'special', id: 'here', displayName: 'here', value: '@here' },
    { type: 'special', id: 'everyone', displayName: 'everyone', value: '@everyone' },
  ];

  // Filter special mentions
  if (query.length === 0 || specialMentions.some((s) => s.displayName.includes(query.toLowerCase()))) {
    suggestions.push(
      ...specialMentions.filter((s) =>
        query.length === 0 || s.displayName.toLowerCase().includes(query.toLowerCase())
      )
    );
  }

  // Filter users
  const users = membersData?.members || [];
  const filteredUsers = users
    .filter((m) =>
      m.user.displayName.toLowerCase().includes(query.toLowerCase()) ||
      m.user.email.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 5)
    .map((m) => ({
      type: 'user' as const,
      id: m.user.id,
      displayName: m.user.displayName,
      value: `@${m.user.displayName.replace(/\s+/g, '_')}`,
      isOnline: onlineUsers.has(m.user.id),
    }));

  suggestions.push(...filteredUsers);

  // Filter channels (for #channel mentions)
  if (query.startsWith('#') || query.length === 0) {
    const channelQuery = query.startsWith('#') ? query.slice(1) : query;
    const channels = channelsData?.channels || [];
    const filteredChannels = channels
      .filter((c) => c.name.toLowerCase().includes(channelQuery.toLowerCase()))
      .slice(0, 3)
      .map((c) => ({
        type: 'channel' as const,
        id: c.id,
        displayName: c.name,
        value: `#${c.name}`,
      }));
    suggestions.push(...filteredChannels);
  }

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (suggestions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          if (suggestions[selectedIndex]) {
            onSelect(suggestions[selectedIndex]);
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
  }, [suggestions, selectedIndex, onSelect, onClose]);

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

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="absolute bg-white rounded-lg shadow-xl border z-50 py-2 min-w-[250px] max-h-[300px] overflow-y-auto animate-slide-up"
      style={{ bottom: position.top, left: position.left }}
    >
      <div className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase">
        Suggestions
      </div>
      {suggestions.map((item, index) => (
        <button
          key={`${item.type}-${item.id}`}
          onClick={() => onSelect(item)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
            index === selectedIndex ? 'bg-primary-50' : 'hover:bg-gray-50'
          )}
        >
          {item.type === 'user' && (
            <>
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center text-white font-medium">
                  {item.displayName.charAt(0).toUpperCase()}
                </div>
                {(item as any).isOnline && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{item.displayName}</div>
                <div className="text-xs text-gray-500 truncate">{item.value}</div>
              </div>
            </>
          )}
          {item.type === 'channel' && (
            <>
              <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                <Hash className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{item.displayName}</div>
                <div className="text-xs text-gray-500">Channel</div>
              </div>
            </>
          )}
          {item.type === 'special' && (
            <>
              <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Users className="w-4 h-4 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{item.value}</div>
                <div className="text-xs text-gray-500">
                  {item.id === 'channel' && 'Notify everyone in this channel'}
                  {item.id === 'here' && 'Notify online members'}
                  {item.id === 'everyone' && 'Notify all workspace members'}
                </div>
              </div>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
