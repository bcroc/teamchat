import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/workspace';
import { toast } from '../stores/toast';
import { clsx } from 'clsx';
import {
  Bot,
  Plus,
  X,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Settings,
  Key,
  RefreshCw,
  Power,
  PowerOff,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';

interface BotData {
  id: string;
  name: string;
  displayName: string;
  description?: string | null;
  avatarUrl?: string | null;
  isEnabled: boolean;
  createdAt: string;
  scopes: string[];
  tokenCount: number;
  webhookCount: number;
  commandCount: number;
}

interface BotToken {
  id: string;
  tokenPrefix: string;
  name: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  isRevoked: boolean;
  createdAt: string;
}

interface BotManagementPanelProps {
  onClose: () => void;
}

const AVAILABLE_SCOPES = [
  { value: 'messages:read', label: 'Read Messages', description: 'Read messages in channels' },
  { value: 'messages:write', label: 'Send Messages', description: 'Post messages to channels' },
  { value: 'messages:delete', label: 'Delete Messages', description: 'Delete bot\'s own messages' },
  { value: 'channels:read', label: 'Read Channels', description: 'View channel information' },
  { value: 'channels:history', label: 'Channel History', description: 'Access message history' },
  { value: 'users:read', label: 'Read Users', description: 'View user profiles' },
  { value: 'reactions:read', label: 'Read Reactions', description: 'View message reactions' },
  { value: 'reactions:write', label: 'Add Reactions', description: 'Add/remove reactions' },
  { value: 'files:read', label: 'Read Files', description: 'View and download files' },
  { value: 'files:write', label: 'Upload Files', description: 'Upload files to channels' },
];

export default function BotManagementPanel({ onClose }: BotManagementPanelProps) {
  const queryClient = useQueryClient();
  const { currentWorkspaceId } = useWorkspaceStore();
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedBot, setSelectedBot] = useState<BotData | null>(null);
  const [showNewToken, setShowNewToken] = useState<string | null>(null);

  // Fetch bots
  const { data: botsData, isLoading } = useQuery({
    queryKey: ['bots', currentWorkspaceId],
    queryFn: () =>
      api.get<{ bots: BotData[] }>('/bots', { workspaceId: currentWorkspaceId! }),
    enabled: !!currentWorkspaceId,
  });

  // Fetch bot tokens
  const { data: tokensData } = useQuery({
    queryKey: ['bot-tokens', selectedBot?.id],
    queryFn: () =>
      api.get<{ tokens: BotToken[] }>(`/bots/${selectedBot!.id}/tokens`),
    enabled: !!selectedBot,
  });

  // Create bot mutation
  const createBotMutation = useMutation({
    mutationFn: (data: {
      name: string;
      displayName: string;
      description?: string;
      scopes: string[];
    }) =>
      api.post<{
        bot: BotData;
        token: { token: string; prefix: string; name: string };
      }>('/bots', { ...data, workspaceId: currentWorkspaceId }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['bots'] });
      setShowNewToken(response.token.token);
      toast.success('Bot created');
      setView('list');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create bot');
    },
  });

  // Toggle bot enabled
  const toggleBotMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      api.patch(`/bots/${id}`, { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bots'] });
    },
  });

  // Delete bot
  const deleteBotMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/bots/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bots'] });
      setSelectedBot(null);
      setView('list');
      toast.success('Bot deleted');
    },
  });

  // Create token
  const createTokenMutation = useMutation({
    mutationFn: ({ botId, name }: { botId: string; name: string }) =>
      api.post<{ token: { token: string } }>(`/bots/${botId}/tokens`, { name }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['bot-tokens'] });
      setShowNewToken(response.token.token);
      toast.success('Token created');
    },
  });

  // Revoke token
  const revokeTokenMutation = useMutation({
    mutationFn: ({ botId, tokenId }: { botId: string; tokenId: string }) =>
      api.post(`/bots/${botId}/tokens/${tokenId}/revoke`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-tokens'] });
      toast.success('Token revoked');
    },
  });

  const bots = botsData?.bots || [];
  const tokens = tokensData?.tokens || [];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            {view !== 'list' && (
              <button
                onClick={() => {
                  setView('list');
                  setSelectedBot(null);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <Bot className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">
              {view === 'list' && 'Bot Management'}
              {view === 'create' && 'Create Bot'}
              {view === 'detail' && selectedBot?.displayName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* New Token Alert */}
          {showNewToken && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-green-800">Bot Token Created</h4>
                  <p className="text-sm text-green-700 mt-1">
                    Save this token now. You won't be able to see it again!
                  </p>
                </div>
                <button
                  onClick={() => setShowNewToken(null)}
                  className="text-green-600 hover:text-green-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 p-2 bg-white rounded border border-green-300 text-sm font-mono break-all">
                  {showNewToken}
                </code>
                <button
                  onClick={() => copyToClipboard(showNewToken)}
                  className="p-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* List View */}
          {view === 'list' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={() => setView('create')}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  <Plus className="w-4 h-4" />
                  Create Bot
                </button>
              </div>

              {isLoading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : bots.length === 0 ? (
                <div className="text-center py-12">
                  <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-700">No Bots Yet</h3>
                  <p className="text-gray-500 mt-1">
                    Create a bot to integrate external services
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {bots.map((bot) => (
                    <div
                      key={bot.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                          {bot.avatarUrl ? (
                            <img
                              src={bot.avatarUrl}
                              alt={bot.displayName}
                              className="w-12 h-12 rounded-full"
                            />
                          ) : (
                            <Bot className="w-6 h-6 text-gray-500" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{bot.displayName}</h4>
                            <span
                              className={clsx(
                                'px-2 py-0.5 text-xs rounded-full',
                                bot.isEnabled
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              )}
                            >
                              {bot.isEnabled ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500">@{bot.name}</p>
                          {bot.description && (
                            <p className="text-sm text-gray-600 mt-1">{bot.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleBotMutation.mutate({
                            id: bot.id,
                            isEnabled: !bot.isEnabled,
                          })}
                          className={clsx(
                            'p-2 rounded hover:bg-gray-100',
                            bot.isEnabled ? 'text-green-600' : 'text-gray-400'
                          )}
                          title={bot.isEnabled ? 'Disable' : 'Enable'}
                        >
                          {bot.isEnabled ? (
                            <Power className="w-5 h-5" />
                          ) : (
                            <PowerOff className="w-5 h-5" />
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedBot(bot);
                            setView('detail');
                          }}
                          className="p-2 rounded hover:bg-gray-100 text-gray-600"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Create View */}
          {view === 'create' && (
            <CreateBotForm
              onSubmit={(data) => createBotMutation.mutate(data)}
              isLoading={createBotMutation.isPending}
            />
          )}

          {/* Detail View */}
          {view === 'detail' && selectedBot && (
            <div className="space-y-6">
              {/* Bot Info */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                    {selectedBot.avatarUrl ? (
                      <img
                        src={selectedBot.avatarUrl}
                        alt={selectedBot.displayName}
                        className="w-16 h-16 rounded-full"
                      />
                    ) : (
                      <Bot className="w-8 h-8 text-gray-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{selectedBot.displayName}</h3>
                    <p className="text-gray-500">@{selectedBot.name}</p>
                  </div>
                </div>
                {selectedBot.description && (
                  <p className="text-gray-600">{selectedBot.description}</p>
                )}
                <div className="flex gap-4 mt-4 text-sm text-gray-500">
                  <span>{selectedBot.tokenCount} tokens</span>
                  <span>{selectedBot.webhookCount} webhooks</span>
                  <span>{selectedBot.scopes.length} scopes</span>
                </div>
              </div>

              {/* Scopes */}
              <div>
                <h4 className="font-medium mb-3">Scopes</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedBot.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tokens */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">API Tokens</h4>
                  <button
                    onClick={() =>
                      createTokenMutation.mutate({
                        botId: selectedBot.id,
                        name: `Token ${tokens.length + 1}`,
                      })
                    }
                    className="text-sm text-primary-600 hover:text-primary-700"
                  >
                    + Create Token
                  </button>
                </div>
                <div className="space-y-2">
                  {tokens.map((token) => (
                    <div
                      key={token.id}
                      className={clsx(
                        'flex items-center justify-between p-3 border rounded',
                        token.isRevoked && 'opacity-50'
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">{token.name}</span>
                          <code className="text-xs text-gray-500">
                            {token.tokenPrefix}...
                          </code>
                          {token.isRevoked && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded">
                              Revoked
                            </span>
                          )}
                        </div>
                        {token.lastUsedAt && (
                          <p className="text-xs text-gray-500 mt-1">
                            Last used: {new Date(token.lastUsedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                      {!token.isRevoked && (
                        <button
                          onClick={() =>
                            revokeTokenMutation.mutate({
                              botId: selectedBot.id,
                              tokenId: token.id,
                            })
                          }
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Danger Zone */}
              <div className="border-t pt-6">
                <h4 className="font-medium text-red-600 mb-3">Danger Zone</h4>
                <button
                  onClick={() => {
                    if (confirm(`Delete bot "${selectedBot.displayName}"? This cannot be undone.`)) {
                      deleteBotMutation.mutate(selectedBot.id);
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Bot
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Create Bot Form Component
interface CreateBotFormProps {
  onSubmit: (data: {
    name: string;
    displayName: string;
    description?: string;
    scopes: string[];
  }) => void;
  isLoading: boolean;
}

function CreateBotForm({ onSubmit, isLoading }: CreateBotFormProps) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    'messages:read',
    'messages:write',
    'channels:read',
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.toLowerCase().replace(/\s+/g, '-'),
      displayName,
      description: description || undefined,
      scopes: selectedScopes,
    });
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope)
        ? prev.filter((s) => s !== scope)
        : [...prev, scope]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Display Name *
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="My Awesome Bot"
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Internal Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
          placeholder="my-awesome-bot"
          pattern="^[a-z0-9_-]+$"
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          Lowercase letters, numbers, dashes, and underscores only
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this bot do?"
          rows={2}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Scopes *
        </label>
        <div className="grid grid-cols-2 gap-2">
          {AVAILABLE_SCOPES.map((scope) => (
            <label
              key={scope.value}
              className={clsx(
                'flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors',
                selectedScopes.includes(scope.value)
                  ? 'border-primary-500 bg-primary-50'
                  : 'hover:bg-gray-50'
              )}
            >
              <input
                type="checkbox"
                checked={selectedScopes.includes(scope.value)}
                onChange={() => toggleScope(scope.value)}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium text-sm">{scope.label}</div>
                <div className="text-xs text-gray-500">{scope.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="submit"
          disabled={isLoading || !name || !displayName || selectedScopes.length === 0}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {isLoading ? 'Creating...' : 'Create Bot'}
        </button>
      </div>
    </form>
  );
}
