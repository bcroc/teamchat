import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/workspace';
import { toast } from '../stores/toast';
import { clsx } from 'clsx';
import {
  Webhook,
  Plus,
  X,
  Copy,
  Trash2,
  RefreshCw,
  Power,
  PowerOff,
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Hash,
  ChevronRight,
} from 'lucide-react';

interface IncomingWebhook {
  id: string;
  name: string;
  description?: string | null;
  channel: { id: string; name: string };
  webhookUrl: string;
  isEnabled: boolean;
  createdAt: string;
}

interface OutgoingWebhook {
  id: string;
  name: string;
  description?: string | null;
  url: string;
  events: string[];
  channelIds: string[];
  isEnabled: boolean;
  deliveryCount: number;
  createdAt: string;
}

interface Channel {
  id: string;
  name: string;
}

interface WebhookManagementPanelProps {
  onClose: () => void;
}

const WEBHOOK_EVENTS = [
  { value: 'message.created', label: 'Message Created' },
  { value: 'message.updated', label: 'Message Updated' },
  { value: 'message.deleted', label: 'Message Deleted' },
  { value: 'reaction.added', label: 'Reaction Added' },
  { value: 'reaction.removed', label: 'Reaction Removed' },
  { value: 'channel.created', label: 'Channel Created' },
  { value: 'channel.updated', label: 'Channel Updated' },
  { value: 'channel.archived', label: 'Channel Archived' },
  { value: 'member.joined', label: 'Member Joined' },
  { value: 'member.left', label: 'Member Left' },
];

export default function WebhookManagementPanel({ onClose }: WebhookManagementPanelProps) {
  const queryClient = useQueryClient();
  const { currentWorkspaceId, channels } = useWorkspaceStore();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [view, setView] = useState<'list' | 'create'>('list');
  const [newWebhookUrl, setNewWebhookUrl] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  // Fetch incoming webhooks
  const { data: incomingData, isLoading: incomingLoading } = useQuery({
    queryKey: ['webhooks-incoming', currentWorkspaceId],
    queryFn: () =>
      api.get<{ webhooks: IncomingWebhook[] }>('/webhooks/incoming', {
        workspaceId: currentWorkspaceId!,
      }),
    enabled: !!currentWorkspaceId && tab === 'incoming',
  });

  // Fetch outgoing webhooks
  const { data: outgoingData, isLoading: outgoingLoading } = useQuery({
    queryKey: ['webhooks-outgoing', currentWorkspaceId],
    queryFn: () =>
      api.get<{ webhooks: OutgoingWebhook[] }>('/webhooks/outgoing', {
        workspaceId: currentWorkspaceId!,
      }),
    enabled: !!currentWorkspaceId && tab === 'outgoing',
  });

  // Create incoming webhook
  const createIncomingMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; channelId: string }) =>
      api.post<{ webhook: IncomingWebhook }>('/webhooks/incoming', {
        ...data,
        workspaceId: currentWorkspaceId,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks-incoming'] });
      setNewWebhookUrl(response.webhook.webhookUrl);
      toast.success('Webhook created');
      setView('list');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create webhook');
    },
  });

  // Create outgoing webhook
  const createOutgoingMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      url: string;
      events: string[];
      channelIds?: string[];
    }) =>
      api.post<{ webhook: OutgoingWebhook & { secret: string } }>('/webhooks/outgoing', {
        ...data,
        workspaceId: currentWorkspaceId,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks-outgoing'] });
      setNewSecret((response.webhook as any).secret);
      toast.success('Webhook created');
      setView('list');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create webhook');
    },
  });

  // Toggle webhook
  const toggleIncomingMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      api.patch(`/webhooks/incoming/${id}`, { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks-incoming'] });
    },
  });

  const toggleOutgoingMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      api.patch(`/webhooks/outgoing/${id}`, { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks-outgoing'] });
    },
  });

  // Delete webhooks
  const deleteIncomingMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/incoming/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks-incoming'] });
      toast.success('Webhook deleted');
    },
  });

  const deleteOutgoingMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/outgoing/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks-outgoing'] });
      toast.success('Webhook deleted');
    },
  });

  // Regenerate URL/Secret
  const regenerateUrlMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ webhookUrl: string }>(`/webhooks/incoming/${id}/regenerate`, {}),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks-incoming'] });
      setNewWebhookUrl(response.webhookUrl);
      toast.success('Webhook URL regenerated');
    },
  });

  const regenerateSecretMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ secret: string }>(`/webhooks/outgoing/${id}/regenerate-secret`, {}),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks-outgoing'] });
      setNewSecret(response.secret);
      toast.success('Secret regenerated');
    },
  });

  const incomingWebhooks = incomingData?.webhooks || [];
  const outgoingWebhooks = outgoingData?.webhooks || [];
  const isLoading = tab === 'incoming' ? incomingLoading : outgoingLoading;

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
            {view === 'create' && (
              <button
                onClick={() => setView('list')}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <Webhook className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-semibold">
              {view === 'list' ? 'Webhooks' : `Create ${tab === 'incoming' ? 'Incoming' : 'Outgoing'} Webhook`}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        {view === 'list' && (
          <div className="flex border-b px-6">
            <button
              onClick={() => setTab('incoming')}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px',
                tab === 'incoming'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <ArrowDownToLine className="w-4 h-4" />
              Incoming
            </button>
            <button
              onClick={() => setTab('outgoing')}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px',
                tab === 'outgoing'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <ArrowUpFromLine className="w-4 h-4" />
              Outgoing
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* New URL/Secret Alert */}
          {(newWebhookUrl || newSecret) && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-green-800">
                    {newWebhookUrl ? 'Webhook URL' : 'Signing Secret'}
                  </h4>
                  <p className="text-sm text-green-700 mt-1">
                    {newWebhookUrl
                      ? "Post JSON to this URL to send messages"
                      : "Use this secret to verify webhook signatures"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setNewWebhookUrl(null);
                    setNewSecret(null);
                  }}
                  className="text-green-600 hover:text-green-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 p-2 bg-white rounded border border-green-300 text-sm font-mono break-all">
                  {newWebhookUrl || newSecret}
                </code>
                <button
                  onClick={() => copyToClipboard(newWebhookUrl || newSecret || '')}
                  className="p-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {view === 'list' && (
            <>
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setView('create')}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  <Plus className="w-4 h-4" />
                  Create {tab === 'incoming' ? 'Incoming' : 'Outgoing'} Webhook
                </button>
              </div>

              {isLoading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : (
                <>
                  {/* Incoming Webhooks */}
                  {tab === 'incoming' && (
                    incomingWebhooks.length === 0 ? (
                      <div className="text-center py-12">
                        <ArrowDownToLine className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-700">No Incoming Webhooks</h3>
                        <p className="text-gray-500 mt-1">
                          Create a webhook to post messages from external services
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {incomingWebhooks.map((webhook) => (
                          <div
                            key={webhook.id}
                            className="p-4 border rounded-lg hover:bg-gray-50"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{webhook.name}</h4>
                                <span
                                  className={clsx(
                                    'px-2 py-0.5 text-xs rounded-full',
                                    webhook.isEnabled
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-500'
                                  )}
                                >
                                  {webhook.isEnabled ? 'Active' : 'Disabled'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => copyToClipboard(webhook.webhookUrl)}
                                  className="p-2 rounded hover:bg-gray-100 text-gray-500"
                                  title="Copy URL"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => regenerateUrlMutation.mutate(webhook.id)}
                                  className="p-2 rounded hover:bg-gray-100 text-gray-500"
                                  title="Regenerate URL"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    toggleIncomingMutation.mutate({
                                      id: webhook.id,
                                      isEnabled: !webhook.isEnabled,
                                    })
                                  }
                                  className={clsx(
                                    'p-2 rounded hover:bg-gray-100',
                                    webhook.isEnabled ? 'text-green-600' : 'text-gray-400'
                                  )}
                                  title={webhook.isEnabled ? 'Disable' : 'Enable'}
                                >
                                  {webhook.isEnabled ? (
                                    <Power className="w-4 h-4" />
                                  ) : (
                                    <PowerOff className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Delete this webhook?')) {
                                      deleteIncomingMutation.mutate(webhook.id);
                                    }
                                  }}
                                  className="p-2 rounded hover:bg-red-100 text-red-500"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Hash className="w-4 h-4" />
                              <span>{webhook.channel.name}</span>
                            </div>
                            {webhook.description && (
                              <p className="text-sm text-gray-600 mt-2">{webhook.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {/* Outgoing Webhooks */}
                  {tab === 'outgoing' && (
                    outgoingWebhooks.length === 0 ? (
                      <div className="text-center py-12">
                        <ArrowUpFromLine className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-700">No Outgoing Webhooks</h3>
                        <p className="text-gray-500 mt-1">
                          Create a webhook to receive events from TeamChat
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {outgoingWebhooks.map((webhook) => (
                          <div
                            key={webhook.id}
                            className="p-4 border rounded-lg hover:bg-gray-50"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{webhook.name}</h4>
                                <span
                                  className={clsx(
                                    'px-2 py-0.5 text-xs rounded-full',
                                    webhook.isEnabled
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-500'
                                  )}
                                >
                                  {webhook.isEnabled ? 'Active' : 'Disabled'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => regenerateSecretMutation.mutate(webhook.id)}
                                  className="p-2 rounded hover:bg-gray-100 text-gray-500"
                                  title="Regenerate Secret"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    toggleOutgoingMutation.mutate({
                                      id: webhook.id,
                                      isEnabled: !webhook.isEnabled,
                                    })
                                  }
                                  className={clsx(
                                    'p-2 rounded hover:bg-gray-100',
                                    webhook.isEnabled ? 'text-green-600' : 'text-gray-400'
                                  )}
                                  title={webhook.isEnabled ? 'Disable' : 'Enable'}
                                >
                                  {webhook.isEnabled ? (
                                    <Power className="w-4 h-4" />
                                  ) : (
                                    <PowerOff className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Delete this webhook?')) {
                                      deleteOutgoingMutation.mutate(webhook.id);
                                    }
                                  }}
                                  className="p-2 rounded hover:bg-red-100 text-red-500"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <p className="text-sm text-gray-500 mb-2 font-mono">{webhook.url}</p>
                            <div className="flex flex-wrap gap-1">
                              {webhook.events.map((event) => (
                                <span
                                  key={event}
                                  className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                                >
                                  {event}
                                </span>
                              ))}
                            </div>
                            <div className="text-xs text-gray-400 mt-2">
                              {webhook.deliveryCount} deliveries
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </>
              )}
            </>
          )}

          {/* Create Forms */}
          {view === 'create' && tab === 'incoming' && (
            <CreateIncomingWebhookForm
              channels={channels}
              onSubmit={(data) => createIncomingMutation.mutate(data)}
              isLoading={createIncomingMutation.isPending}
            />
          )}

          {view === 'create' && tab === 'outgoing' && (
            <CreateOutgoingWebhookForm
              channels={channels}
              onSubmit={(data) => createOutgoingMutation.mutate(data)}
              isLoading={createOutgoingMutation.isPending}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Create Incoming Webhook Form
function CreateIncomingWebhookForm({
  channels,
  onSubmit,
  isLoading,
}: {
  channels: Channel[];
  onSubmit: (data: { name: string; description?: string; channelId: string }) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channelId, setChannelId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      channelId,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="GitHub Notifications"
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Channel *
        </label>
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          required
        >
          <option value="">Select a channel</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{channel.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What will this webhook post?"
          rows={2}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="flex justify-end pt-4">
        <button
          type="submit"
          disabled={isLoading || !name || !channelId}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {isLoading ? 'Creating...' : 'Create Webhook'}
        </button>
      </div>
    </form>
  );
}

// Create Outgoing Webhook Form
function CreateOutgoingWebhookForm({
  channels,
  onSubmit,
  isLoading,
}: {
  channels: Channel[];
  onSubmit: (data: {
    name: string;
    description?: string;
    url: string;
    events: string[];
    channelIds?: string[];
  }) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['message.created']);
  const [channelIds, setChannelIds] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      url,
      events,
      channelIds: channelIds.length > 0 ? channelIds : undefined,
    });
  };

  const toggleEvent = (event: string) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const toggleChannel = (id: string) => {
    setChannelIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Integration"
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          URL *
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhook"
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this webhook do?"
          rows={2}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Events *
        </label>
        <div className="grid grid-cols-2 gap-2">
          {WEBHOOK_EVENTS.map((event) => (
            <label
              key={event.value}
              className={clsx(
                'flex items-center gap-2 p-2 border rounded cursor-pointer',
                events.includes(event.value) && 'border-primary-500 bg-primary-50'
              )}
            >
              <input
                type="checkbox"
                checked={events.includes(event.value)}
                onChange={() => toggleEvent(event.value)}
              />
              <span className="text-sm">{event.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Channels (optional)
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Leave empty to receive events from all channels
        </p>
        <div className="flex flex-wrap gap-2">
          {channels.map((channel) => (
            <label
              key={channel.id}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 border rounded cursor-pointer text-sm',
                channelIds.includes(channel.id) && 'border-primary-500 bg-primary-50'
              )}
            >
              <input
                type="checkbox"
                checked={channelIds.includes(channel.id)}
                onChange={() => toggleChannel(channel.id)}
                className="sr-only"
              />
              #{channel.name}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          type="submit"
          disabled={isLoading || !name || !url || events.length === 0}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {isLoading ? 'Creating...' : 'Create Webhook'}
        </button>
      </div>
    </form>
  );
}
