import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/workspace';
import { format } from 'date-fns';
import { Search, X, Hash, Lock, MessageSquare, User, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { debounce } from '../lib/utils';
import type { Message, Channel } from '@teamchat/shared';

interface SearchPanelProps {
  onClose: () => void;
  onSelectMessage?: (message: Message) => void;
}

interface SearchResult {
  items: Array<Message & {
    channel?: { id: string; name: string } | null;
    dmThread?: { id: string } | null;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

export default function SearchPanel({ onClose, onSelectMessage }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const { currentWorkspaceId, setCurrentChannel, setCurrentDmThread } = useWorkspaceStore();

  // Debounce search query
  const debouncedSetQuery = useCallback(
    debounce((value: string) => {
      setDebouncedQuery(value);
    }, 300),
    []
  );

  useEffect(() => {
    debouncedSetQuery(query);
  }, [query, debouncedSetQuery]);

  // Search messages
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', currentWorkspaceId, debouncedQuery],
    queryFn: () =>
      api.get<SearchResult>('/messages/search', {
        workspaceId: currentWorkspaceId!,
        q: debouncedQuery,
        limit: 20,
      }),
    enabled: !!currentWorkspaceId && debouncedQuery.length >= 2,
  });

  const handleResultClick = (result: SearchResult['items'][0]) => {
    if (result.channelId) {
      setCurrentChannel(result.channelId);
    } else if (result.dmThreadId) {
      setCurrentDmThread(result.dmThreadId);
    }
    onSelectMessage?.(result);
    onClose();
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50 animate-modal-backdrop">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[70vh] flex flex-col overflow-hidden animate-modal-enter">
        {/* Search input */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages..."
              className="w-full pl-12 pr-12 py-3 bg-gray-100 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white"
              autoFocus
            />
            {(isLoading || isFetching) && (
              <Loader2 className="absolute right-12 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
            )}
            <button
              onClick={onClose}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          {query.length > 0 && query.length < 2 && (
            <p className="text-sm text-gray-500 mt-2">Type at least 2 characters to search</p>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {debouncedQuery.length >= 2 && data?.items && data.items.length === 0 && !isLoading && (
            <div className="p-8 text-center text-gray-500">
              <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No results found</p>
              <p className="text-sm">Try different keywords or check your spelling</p>
            </div>
          )}

          {data?.items && data.items.length > 0 && (
            <div className="divide-y">
              {data.items.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleResultClick(result)}
                  className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  {/* Location indicator */}
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    {result.channel ? (
                      <>
                        <Hash className="w-3 h-3" />
                        <span>{result.channel.name}</span>
                      </>
                    ) : (
                      <>
                        <MessageSquare className="w-3 h-3" />
                        <span>Direct Message</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{format(new Date(result.createdAt), 'MMM d, yyyy')}</span>
                  </div>

                  {/* Sender info */}
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded bg-primary-500 flex items-center justify-center text-white text-xs font-medium">
                      {result.sender?.displayName?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <span className="font-medium text-sm">{result.sender?.displayName}</span>
                    <span className="text-xs text-gray-400">
                      {format(new Date(result.createdAt), 'h:mm a')}
                    </span>
                  </div>

                  {/* Message preview with highlighted search term */}
                  <p className="text-gray-700 text-sm line-clamp-2">
                    <HighlightedText text={result.body} searchTerm={debouncedQuery} />
                  </p>
                </button>
              ))}
            </div>
          )}

          {!debouncedQuery && (
            <div className="p-8 text-center text-gray-500">
              <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Search messages</p>
              <p className="text-sm">Find messages across channels and DMs</p>
            </div>
          )}
        </div>

        {/* Footer with keyboard shortcuts */}
        <div className="p-3 border-t bg-gray-50 text-xs text-gray-500 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">↵</kbd> to select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">Esc</kbd> to close
            </span>
          </div>
          {data?.items && data.items.length > 0 && (
            <span>{data.items.length} results</span>
          )}
        </div>
      </div>
    </div>
  );
}

function HighlightedText({ text, searchTerm }: { text: string; searchTerm: string }) {
  if (!searchTerm) return <>{text}</>;

  const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === searchTerm.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}
