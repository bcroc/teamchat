import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/workspace';
import { useSocketStore } from '../stores/socket';
import { Search, Hash, Lock, MessageSquare, User, X, Command } from 'lucide-react';
import { clsx } from 'clsx';
import type { Channel, DmThread, User as UserType } from '@teamchat/shared';

interface QuickSwitcherProps {
  onClose: () => void;
}

type ResultItem = {
  type: 'channel' | 'dm' | 'action';
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  isPrivate?: boolean;
};

export default function QuickSwitcher({ onClose }: QuickSwitcherProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    currentWorkspaceId,
    setCurrentChannel,
    setCurrentDmThread,
    openPinnedMessages,
    openSavedMessages,
  } = useWorkspaceStore();
  const { onlineUsers } = useSocketStore();

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fetch channels
  const { data: channelsData } = useQuery({
    queryKey: ['channels', currentWorkspaceId],
    queryFn: () =>
      api.get<{ channels: Array<Channel & { isMember: boolean }> }>('/channels', {
        workspaceId: currentWorkspaceId!,
      }),
    enabled: !!currentWorkspaceId,
  });

  // Fetch DMs
  const { data: dmsData } = useQuery({
    queryKey: ['dms', currentWorkspaceId],
    queryFn: () =>
      api.get<{ dmThreads: Array<DmThread & { otherUser: UserType }> }>('/dms', {
        workspaceId: currentWorkspaceId!,
      }),
    enabled: !!currentWorkspaceId,
  });

  // Build results list
  const results = useMemo(() => {
    const items: ResultItem[] = [];
    const lowerQuery = query.toLowerCase().trim();

    // Action items (always available when no query or specific keywords)
    const actions: ResultItem[] = [
      {
        type: 'action',
        id: 'saved',
        title: 'Saved messages',
        subtitle: 'View your saved messages',
        icon: <MessageSquare className="w-4 h-4" />,
      },
    ];

    // Add channels
    const channels = channelsData?.channels || [];
    channels.forEach((channel) => {
      items.push({
        type: 'channel',
        id: channel.id,
        title: channel.name,
        subtitle: channel.description || undefined,
        icon: channel.isPrivate ? (
          <Lock className="w-4 h-4" />
        ) : (
          <Hash className="w-4 h-4" />
        ),
        isPrivate: channel.isPrivate,
      });
    });

    // Add DMs
    const dms = dmsData?.dmThreads || [];
    dms.forEach((dm) => {
      const isOnline = dm.otherUser ? onlineUsers.has(dm.otherUser.id) : false;
      items.push({
        type: 'dm',
        id: dm.id,
        title: dm.otherUser?.displayName || 'Unknown User',
        subtitle: isOnline ? 'Online' : 'Offline',
        icon: (
          <div className="relative">
            <User className="w-4 h-4" />
            {isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full" />
            )}
          </div>
        ),
      });
    });

    // Filter by query
    let filtered = items;
    if (lowerQuery) {
      filtered = items.filter(
        (item) =>
          item.title.toLowerCase().includes(lowerQuery) ||
          (item.subtitle?.toLowerCase().includes(lowerQuery))
      );

      // Also filter actions
      const filteredActions = actions.filter(
        (action) =>
          action.title.toLowerCase().includes(lowerQuery) ||
          (action.subtitle?.toLowerCase().includes(lowerQuery))
      );

      return [...filteredActions, ...filtered];
    }

    // If no query, show actions first then recent/all items
    return [...actions, ...items.slice(0, 10)];
  }, [query, channelsData, dmsData, onlineUsers]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
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
  }, [results, selectedIndex, onClose]);

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

  const handleSelect = (item: ResultItem) => {
    switch (item.type) {
      case 'channel':
        setCurrentChannel(item.id);
        break;
      case 'dm':
        setCurrentDmThread(item.id);
        break;
      case 'action':
        if (item.id === 'saved') {
          openSavedMessages();
        }
        break;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50 animate-modal-backdrop">
      <div
        ref={containerRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-modal-enter"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels, DMs, or actions..."
            className="flex-1 outline-none text-lg"
          />
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No results found for "{query}"
            </div>
          ) : (
            results.map((item, index) => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  index === selectedIndex ? 'bg-primary-50' : 'hover:bg-gray-50'
                )}
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">
                      {item.type === 'channel' ? '#' : ''}{item.title}
                    </span>
                    {item.type === 'channel' && (
                      <span className="text-xs text-gray-400">Channel</span>
                    )}
                    {item.type === 'dm' && (
                      <span className="text-xs text-gray-400">Direct message</span>
                    )}
                    {item.type === 'action' && (
                      <span className="text-xs text-gray-400">Action</span>
                    )}
                  </div>
                  {item.subtitle && (
                    <div className="text-sm text-gray-500 truncate">{item.subtitle}</div>
                  )}
                </div>
                {index === selectedIndex && (
                  <kbd className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-500">
                    Enter
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 px-4 py-2 border-t bg-gray-50 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border rounded">↑</kbd>
            <kbd className="px-1.5 py-0.5 bg-white border rounded">↓</kbd>
            <span>Navigate</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border rounded">Enter</kbd>
            <span>Select</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border rounded">Esc</kbd>
            <span>Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
