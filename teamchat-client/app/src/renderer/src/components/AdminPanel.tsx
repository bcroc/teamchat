/**
 * Admin Panel Component
 *
 * Server administration panel with tabs for:
 * - Dashboard (statistics overview)
 * - User management
 * - Workspace management
 * - Server settings
 * - Announcements
 * - Audit logs
 *
 * @module apps/desktop/src/renderer/src/components/AdminPanel
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  Users,
  Building2,
  Settings,
  Megaphone,
  ClipboardList,
  LayoutDashboard,
  UserX,
  UserCheck,
  ShieldCheck,
  ShieldOff,
  Trash2,
  X,
  AlertTriangle,
  Info,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  Power,
  PowerOff,
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from '../stores/toast';
import type {
  AdminDashboardStats,
  AdminUser,
  AdminWorkspace,
  AdminAuditLog,
  ServerSettings,
  SystemAnnouncement,
} from '@teamchat/shared';

type Tab = 'dashboard' | 'users' | 'workspaces' | 'settings' | 'announcements' | 'audit';

interface AdminPanelProps {
  onClose: () => void;
}

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'workspaces', label: 'Workspaces', icon: Building2 },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'audit', label: 'Audit Logs', icon: ClipboardList },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg w-[90vw] h-[85vh] max-w-6xl flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 bg-gray-800 border-r border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Admin Panel</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex-1 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                )}
              >
                <tab.icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'workspaces' && <WorkspacesTab />}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'announcements' && <AnnouncementsTab />}
          {activeTab === 'audit' && <AuditLogsTab />}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Dashboard Tab
// ============================================

function DashboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.get('/admin/dashboard'),
  });

  if (isLoading) {
    return <div className="p-6 text-gray-400">Loading...</div>;
  }

  const stats: AdminDashboardStats = data?.stats;
  const recent = data?.recent;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-6">
      <h3 className="text-xl font-semibold text-white mb-6">Dashboard</h3>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Users"
          value={stats?.users.total || 0}
          subtitle={`${stats?.users.newToday || 0} new today`}
          color="blue"
        />
        <StatCard
          title="Active Users"
          value={stats?.users.active || 0}
          subtitle={`${stats?.users.suspended || 0} suspended`}
          color="green"
        />
        <StatCard
          title="Workspaces"
          value={stats?.workspaces.total || 0}
          subtitle={`${stats?.workspaces.disabled || 0} disabled`}
          color="purple"
        />
        <StatCard
          title="Storage Used"
          value={formatBytes(stats?.storage.totalBytes || 0)}
          subtitle={`${stats?.storage.totalFiles || 0} files`}
          color="orange"
        />
      </div>

      {/* Messages Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard
          title="Total Messages"
          value={stats?.messages.total.toLocaleString() || 0}
          subtitle={`${stats?.messages.today || 0} today`}
          color="indigo"
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-400 mb-3">Recent Users</h4>
          <div className="space-y-2">
            {recent?.users?.map((user: any) => (
              <div key={user.id} className="flex items-center justify-between text-sm">
                <span className="text-white">{user.displayName}</span>
                <span className="text-gray-500">{user.email}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-400 mb-3">Recent Workspaces</h4>
          <div className="space-y-2">
            {recent?.workspaces?.map((ws: any) => (
              <div key={ws.id} className="flex items-center justify-between text-sm">
                <span className="text-white">{ws.name}</span>
                <span className="text-gray-500">{ws.memberCount} members</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/30',
    green: 'bg-green-500/10 border-green-500/30',
    purple: 'bg-purple-500/10 border-purple-500/30',
    orange: 'bg-orange-500/10 border-orange-500/30',
    indigo: 'bg-indigo-500/10 border-indigo-500/30',
  };

  return (
    <div className={clsx('rounded-lg border p-4', colorClasses[color])}>
      <p className="text-sm text-gray-400">{title}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
    </div>
  );
}

// ============================================
// Users Tab
// ============================================

function UsersTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', page, search, status],
    queryFn: () =>
      api.get(`/admin/users?page=${page}&limit=20&search=${search}&status=${status}`),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/users/${id}/suspend`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('User suspended');
    },
  });

  const unsuspendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/unsuspend`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('User unsuspended');
    },
  });

  const promoteMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/promote`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('User promoted to admin');
    },
  });

  const demoteMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/demote`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('User demoted from admin');
    },
  });

  const users: AdminUser[] = data?.users || [];
  const pagination = data?.pagination;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-white">User Management</h3>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm w-64"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
          >
            <option value="">All Users</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="admin">Admins</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Workspaces
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Messages
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Joined
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white font-medium">{user.displayName}</p>
                          <p className="text-sm text-gray-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {user.isServerAdmin && (
                          <span className="px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded text-xs">
                            Admin
                          </span>
                        )}
                        {user.isSuspended ? (
                          <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">
                            Suspended
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                            Active
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{user.workspaceCount || 0}</td>
                    <td className="px-4 py-3 text-gray-300">{user.messageCount || 0}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {user.isSuspended ? (
                          <button
                            onClick={() => unsuspendMutation.mutate(user.id)}
                            className="p-1.5 hover:bg-gray-700 rounded text-green-400"
                            title="Unsuspend"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              const reason = prompt('Suspension reason:');
                              if (reason) suspendMutation.mutate({ id: user.id, reason });
                            }}
                            className="p-1.5 hover:bg-gray-700 rounded text-orange-400"
                            title="Suspend"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                        {user.isServerAdmin ? (
                          <button
                            onClick={() => demoteMutation.mutate(user.id)}
                            className="p-1.5 hover:bg-gray-700 rounded text-yellow-400"
                            title="Remove Admin"
                          >
                            <ShieldOff className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => promoteMutation.mutate(user.id)}
                            className="p-1.5 hover:bg-gray-700 rounded text-indigo-400"
                            title="Make Admin"
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-400">
                Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, pagination.total)} of{' '}
                {pagination.total} users
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 hover:bg-gray-700 rounded disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-400" />
                </button>
                <span className="text-gray-400 text-sm">
                  Page {page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="p-2 hover:bg-gray-700 rounded disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// Workspaces Tab
// ============================================

function WorkspacesTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'workspaces', page, search, status],
    queryFn: () =>
      api.get(`/admin/workspaces?page=${page}&limit=20&search=${search}&status=${status}`),
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/workspaces/${id}/disable`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'workspaces'] });
      toast.success('Workspace disabled');
    },
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/workspaces/${id}/enable`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'workspaces'] });
      toast.success('Workspace enabled');
    },
  });

  const workspaces: AdminWorkspace[] = data?.workspaces || [];
  const pagination = data?.pagination;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-white">Workspace Management</h3>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search workspaces..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm w-64"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
          >
            <option value="">All Workspaces</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Workspace
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Members
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Channels
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Messages
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Created
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {workspaces.map((ws) => (
                  <tr key={ws.id} className="hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-white font-medium">{ws.name}</p>
                        {ws.description && (
                          <p className="text-sm text-gray-400 truncate max-w-xs">
                            {ws.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {ws.isPublic && (
                          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                            Public
                          </span>
                        )}
                        {ws.isDisabled ? (
                          <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">
                            Disabled
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                            Active
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{ws.memberCount || 0}</td>
                    <td className="px-4 py-3 text-gray-300">{ws.channelCount || 0}</td>
                    <td className="px-4 py-3 text-gray-300">{ws.messageCount || 0}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {new Date(ws.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {ws.isDisabled ? (
                          <button
                            onClick={() => enableMutation.mutate(ws.id)}
                            className="p-1.5 hover:bg-gray-700 rounded text-green-400"
                            title="Enable"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => disableMutation.mutate(ws.id)}
                            className="p-1.5 hover:bg-gray-700 rounded text-orange-400"
                            title="Disable"
                          >
                            <PowerOff className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-400">
                Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, pagination.total)} of{' '}
                {pagination.total} workspaces
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 hover:bg-gray-700 rounded disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-400" />
                </button>
                <span className="text-gray-400 text-sm">
                  Page {page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="p-2 hover:bg-gray-700 rounded disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// Settings Tab
// ============================================

function SettingsTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get('/admin/settings'),
  });

  const updateMutation = useMutation({
    mutationFn: (settings: Partial<ServerSettings>) => api.patch('/admin/settings', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      toast.success('Settings updated');
    },
  });

  const settings: ServerSettings | undefined = data?.settings;

  if (isLoading || !settings) {
    return <div className="p-6 text-gray-400">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h3 className="text-xl font-semibold text-white mb-6">Server Settings</h3>

      <div className="space-y-6 max-w-2xl">
        {/* General Settings */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-lg font-medium text-white mb-4">General</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Server Name</label>
              <input
                type="text"
                defaultValue={settings.serverName}
                onBlur={(e) => updateMutation.mutate({ serverName: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
              <textarea
                defaultValue={settings.serverDescription || ''}
                onBlur={(e) => updateMutation.mutate({ serverDescription: e.target.value || null })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Registration Settings */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-lg font-medium text-white mb-4">Registration</h4>
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-gray-300">Allow Public Registration</span>
              <input
                type="checkbox"
                checked={settings.allowPublicRegistration}
                onChange={(e) => updateMutation.mutate({ allowPublicRegistration: e.target.checked })}
                className="w-5 h-5 rounded bg-gray-700 border-gray-600"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-gray-300">Require Email Verification</span>
              <input
                type="checkbox"
                checked={settings.requireEmailVerification}
                onChange={(e) =>
                  updateMutation.mutate({ requireEmailVerification: e.target.checked })
                }
                className="w-5 h-5 rounded bg-gray-700 border-gray-600"
              />
            </label>
          </div>
        </div>

        {/* Limits */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-lg font-medium text-white mb-4">Limits</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Max Workspaces per User
              </label>
              <input
                type="number"
                defaultValue={settings.maxWorkspacesPerUser}
                onBlur={(e) =>
                  updateMutation.mutate({ maxWorkspacesPerUser: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Max Members per Workspace
              </label>
              <input
                type="number"
                defaultValue={settings.maxMembersPerWorkspace}
                onBlur={(e) =>
                  updateMutation.mutate({ maxMembersPerWorkspace: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Max File Upload Size (MB)
              </label>
              <input
                type="number"
                defaultValue={settings.maxFileUploadSize / 1048576}
                onBlur={(e) =>
                  updateMutation.mutate({ maxFileUploadSize: parseInt(e.target.value) * 1048576 })
                }
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-lg font-medium text-white mb-4">Security</h4>
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-gray-300">Enable End-to-End Encryption</span>
              <input
                type="checkbox"
                checked={settings.enableE2EE}
                onChange={(e) => updateMutation.mutate({ enableE2EE: e.target.checked })}
                className="w-5 h-5 rounded bg-gray-700 border-gray-600"
              />
            </label>
          </div>
        </div>

        {/* Maintenance Mode */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-lg font-medium text-white mb-4">Maintenance</h4>
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-gray-300">Maintenance Mode</span>
              <input
                type="checkbox"
                checked={settings.maintenanceMode}
                onChange={(e) => updateMutation.mutate({ maintenanceMode: e.target.checked })}
                className="w-5 h-5 rounded bg-gray-700 border-gray-600"
              />
            </label>
            {settings.maintenanceMode && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Maintenance Message
                </label>
                <textarea
                  defaultValue={settings.maintenanceMessage || ''}
                  onBlur={(e) =>
                    updateMutation.mutate({ maintenanceMessage: e.target.value || null })
                  }
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  rows={2}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Announcements Tab
// ============================================

function AnnouncementsTab() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'announcements'],
    queryFn: () => api.get('/admin/announcements'),
  });

  const createMutation = useMutation({
    mutationFn: (announcement: { title: string; content: string; type: string }) =>
      api.post('/admin/announcements', announcement),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
      setShowCreate(false);
      toast.success('Announcement created');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/admin/announcements/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/announcements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
      toast.success('Announcement deleted');
    },
  });

  const announcements: SystemAnnouncement[] = data?.announcements || [];

  const typeIcons = {
    info: Info,
    warning: AlertTriangle,
    critical: AlertCircle,
  };

  const typeColors = {
    info: 'text-blue-400 bg-blue-500/20',
    warning: 'text-yellow-400 bg-yellow-500/20',
    critical: 'text-red-400 bg-red-500/20',
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-white">System Announcements</h3>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          New Announcement
        </button>
      </div>

      {showCreate && (
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              createMutation.mutate({
                title: (form.elements.namedItem('title') as HTMLInputElement).value,
                content: (form.elements.namedItem('content') as HTMLTextAreaElement).value,
                type: (form.elements.namedItem('type') as HTMLSelectElement).value,
              });
            }}
          >
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input
                name="title"
                placeholder="Title"
                required
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
              <select
                name="type"
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <textarea
              name="content"
              placeholder="Announcement content..."
              required
              rows={3}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => {
            const Icon = typeIcons[ann.type as keyof typeof typeIcons] || Info;
            return (
              <div
                key={ann.id}
                className={clsx(
                  'bg-gray-800 rounded-lg p-4 border-l-4',
                  ann.type === 'critical'
                    ? 'border-red-500'
                    : ann.type === 'warning'
                    ? 'border-yellow-500'
                    : 'border-blue-500'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={clsx('p-2 rounded-lg', typeColors[ann.type as keyof typeof typeColors])}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-white font-medium">{ann.title}</h4>
                      <p className="text-gray-400 text-sm mt-1">{ann.content}</p>
                      <p className="text-gray-500 text-xs mt-2">
                        {new Date(ann.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleMutation.mutate({ id: ann.id, isActive: !ann.isActive })}
                      className={clsx(
                        'px-3 py-1 rounded text-sm',
                        ann.isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-700 text-gray-400'
                      )}
                    >
                      {ann.isActive ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this announcement?')) {
                          deleteMutation.mutate(ann.id);
                        }
                      }}
                      className="p-1.5 hover:bg-gray-700 rounded text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// Audit Logs Tab
// ============================================

function AuditLogsTab() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit-logs', page, action],
    queryFn: () => api.get(`/admin/audit-logs?page=${page}&limit=50&action=${action}`),
  });

  const logs: AdminAuditLog[] = data?.logs || [];
  const pagination = data?.pagination;

  const actionColors: Record<string, string> = {
    'user.suspend': 'text-orange-400',
    'user.unsuspend': 'text-green-400',
    'user.promote': 'text-indigo-400',
    'user.demote': 'text-yellow-400',
    'user.delete': 'text-red-400',
    'workspace.disable': 'text-orange-400',
    'workspace.enable': 'text-green-400',
    'workspace.delete': 'text-red-400',
    'settings.update': 'text-blue-400',
    'announcement.create': 'text-indigo-400',
    'announcement.update': 'text-blue-400',
    'announcement.delete': 'text-red-400',
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-white">Audit Logs</h3>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
        >
          <option value="">All Actions</option>
          <option value="user.suspend">User Suspended</option>
          <option value="user.unsuspend">User Unsuspended</option>
          <option value="user.promote">User Promoted</option>
          <option value="user.demote">User Demoted</option>
          <option value="workspace.disable">Workspace Disabled</option>
          <option value="workspace.enable">Workspace Enabled</option>
          <option value="settings.update">Settings Updated</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Admin
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Target
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {log.admin?.displayName || 'Unknown'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('font-medium', actionColors[log.action] || 'text-gray-300')}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {log.targetType}: {log.targetId?.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm max-w-xs truncate">
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 hover:bg-gray-700 rounded disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4 text-gray-400" />
              </button>
              <span className="text-gray-400 text-sm">
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="p-2 hover:bg-gray-700 rounded disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
