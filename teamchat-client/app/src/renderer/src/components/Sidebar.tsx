import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/workspace';
import { useAuthStore } from '../stores/auth';
import { useSocketStore } from '../stores/socket';
import { useUnreadStore } from '../stores/unread';
import {
  Hash,
  Lock,
  MessageSquare,
  Plus,
  ChevronDown,
  Settings,
  LogOut,
  Users,
  Circle,
  Clock,
  MinusCircle,
  Shield,
} from 'lucide-react';
import { clsx } from 'clsx';
import CreateChannelModal from './modals/CreateChannelModal';
import CreateWorkspaceModal from './modals/CreateWorkspaceModal';
import CreateGroupDmModal from './modals/CreateGroupDmModal';
import InviteMemberModal from './modals/InviteMemberModal';
import UserSettingsModal from './modals/UserSettingsModal';
import StatusPicker from './StatusPicker';
import AdminPanel from './AdminPanel';
import type { Channel, DmThread, UserStatus } from '@teamchat/shared';

const statusColors: Record<UserStatus, string> = {
  active: 'bg-green-500',
  away: 'bg-yellow-500',
  dnd: 'bg-red-500',
  invisible: 'bg-gray-400',
};

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const {
    currentWorkspaceId,
    currentChannelId,
    currentDmThreadId,
    setCurrentChannel,
    setCurrentDmThread,
    setCurrentWorkspace,
  } = useWorkspaceStore();
  const { onlineUsers } = useSocketStore();
  const { counts, getUnreadCount, resetUnread, getTotalUnread } = useUnreadStore();

  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showCreateGroupDm, setShowCreateGroupDm] = useState(false);
  const [showInviteMember, setShowInviteMember] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Fetch workspaces
  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () =>
      api.get<{ workspaces: Array<{ id: string; name: string; role: string }> }>('/workspaces'),
  });

  // Fetch channels for current workspace
  const { data: channelsData } = useQuery({
    queryKey: ['channels', currentWorkspaceId],
    queryFn: () =>
      api.get<{ channels: Channel[] }>('/channels', { workspaceId: currentWorkspaceId! }),
    enabled: !!currentWorkspaceId,
  });

  // Fetch DMs for current workspace
  const { data: dmsData } = useQuery({
    queryKey: ['dms', currentWorkspaceId],
    queryFn: () =>
      api.get<{
        dms: Array<{
          id: string;
          otherUser: { id: string; displayName: string; avatarUrl?: string };
        }>;
      }>('/dms', { workspaceId: currentWorkspaceId! }),
    enabled: !!currentWorkspaceId,
  });

  const currentWorkspace = workspacesData?.workspaces.find((w) => w.id === currentWorkspaceId);
  const channels = channelsData?.channels || [];
  const dms = dmsData?.dms || [];

  const handleChannelSelect = (channelId: string) => {
    setCurrentChannel(channelId);
    resetUnread({ channelId });
  };

  const handleDmSelect = (dmThreadId: string) => {
    setCurrentDmThread(dmThreadId);
    resetUnread({ dmThreadId });
  };

  // Clear unread when viewing current channel/DM
  useEffect(() => {
    if (currentChannelId) {
      resetUnread({ channelId: currentChannelId });
    }
  }, [currentChannelId, resetUnread]);

  useEffect(() => {
    if (currentDmThreadId) {
      resetUnread({ dmThreadId: currentDmThreadId });
    }
  }, [currentDmThreadId, resetUnread]);

  return (
    <div className="w-64 bg-sidebar text-sidebar-text flex flex-col">
      {/* Workspace header */}
      <div className="h-14 flex items-center px-4 border-b border-sidebar-hover drag-region">
        <button
          onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
          className="flex items-center gap-2 hover:bg-sidebar-hover rounded px-2 py-1 no-drag w-full"
        >
          <span className="font-bold text-sidebar-textBright truncate">
            {currentWorkspace?.name || 'Select Workspace'}
          </span>
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        </button>
      </div>

      {/* Workspace dropdown menu */}
      {showWorkspaceMenu && (
        <div className="absolute top-14 left-2 w-60 bg-white rounded-lg shadow-xl border z-50">
          <div className="p-2">
            <p className="px-2 py-1 text-xs text-gray-500 font-medium">Workspaces</p>
            {workspacesData?.workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  setCurrentWorkspace(ws.id);
                  setShowWorkspaceMenu(false);
                }}
                className={clsx(
                  'w-full text-left px-3 py-2 rounded text-gray-700 hover:bg-gray-100',
                  ws.id === currentWorkspaceId && 'bg-primary-50 text-primary-700'
                )}
              >
                {ws.name}
              </button>
            ))}
            <hr className="my-2" />
            <button
              onClick={() => {
                setShowCreateWorkspace(true);
                setShowWorkspaceMenu(false);
              }}
              className="w-full text-left px-3 py-2 rounded text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Workspace
            </button>
            <button
              onClick={() => {
                setShowInviteMember(true);
                setShowWorkspaceMenu(false);
              }}
              className="w-full text-left px-3 py-2 rounded text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              Invite People
            </button>
          </div>
        </div>
      )}

      {/* Channels section */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-4 mb-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider">Channels</span>
            <button
              onClick={() => setShowCreateChannel(true)}
              className="p-1 hover:bg-sidebar-hover rounded"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {channels.map((channel) => {
          const unreadCount = getUnreadCount({ channelId: channel.id });
          const isActive = currentChannelId === channel.id;

          return (
            <button
              key={channel.id}
              onClick={() => handleChannelSelect(channel.id)}
              className={clsx(
                'w-full flex items-center gap-2 px-4 py-1.5 hover:bg-sidebar-hover',
                isActive && 'bg-sidebar-active text-white',
                unreadCount > 0 && !isActive && 'text-sidebar-textBright font-medium'
              )}
            >
              {channel.isPrivate ? (
                <Lock className="w-4 h-4 flex-shrink-0" />
              ) : (
                <Hash className="w-4 h-4 flex-shrink-0" />
              )}
              <span className="truncate flex-1 text-left">{channel.name}</span>
              {unreadCount > 0 && !isActive && (
                <span className="bg-primary-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          );
        })}

        {/* DMs section */}
        <div className="px-4 mt-6 mb-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider">Direct Messages</span>
            <button
              onClick={() => setShowCreateGroupDm(true)}
              className="p-1 hover:bg-sidebar-hover rounded"
              title="Create group DM"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {dms.map((dm: any) => {
          const unreadCount = getUnreadCount({ dmThreadId: dm.id });
          const isActive = currentDmThreadId === dm.id;
          const isGroup = dm.isGroup;

          // For group DMs, show group name or participant names
          const displayName = isGroup
            ? dm.name || dm.participants?.map((p: any) => p.displayName).slice(0, 3).join(', ') || 'Group DM'
            : dm.otherUser?.displayName || 'Unknown';

          // Count online participants for group DMs
          const hasOnlineParticipant = isGroup
            ? dm.participants?.some((p: any) => onlineUsers.has(p.id))
            : dm.otherUser && onlineUsers.has(dm.otherUser.id);

          return (
            <button
              key={dm.id}
              onClick={() => handleDmSelect(dm.id)}
              className={clsx(
                'w-full flex items-center gap-2 px-4 py-1.5 hover:bg-sidebar-hover',
                isActive && 'bg-sidebar-active text-white',
                unreadCount > 0 && !isActive && 'text-sidebar-textBright font-medium'
              )}
            >
              <div className="relative">
                {isGroup ? (
                  // Group DM icon - show overlapping avatars or users icon
                  <div className="w-5 h-5 rounded bg-gray-500 flex items-center justify-center text-white">
                    <Users className="w-3 h-3" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded bg-gray-400 flex items-center justify-center text-white text-xs">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                {hasOnlineParticipant && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-sidebar" />
                )}
              </div>
              <span className="truncate flex-1 text-left">{displayName}</span>
              {isGroup && dm.participantCount && (
                <span className="text-xs text-sidebar-text opacity-60">{dm.participantCount}</span>
              )}
              {unreadCount > 0 && !isActive && (
                <span className="bg-primary-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* User footer */}
      <div className="p-3 border-t border-sidebar-hover">
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-sidebar-hover rounded"
          >
            <div className="relative">
              <div className="w-8 h-8 rounded bg-primary-500 flex items-center justify-center text-white font-medium">
                {user?.displayName?.charAt(0).toUpperCase()}
              </div>
              <div
                className={clsx(
                  'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-sidebar',
                  statusColors[user?.status as UserStatus || 'active']
                )}
              />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-sidebar-textBright truncate">
                {user?.displayName}
              </p>
              <p className="text-xs text-sidebar-text truncate">
                {user?.customStatus || user?.email}
              </p>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute bottom-full left-0 w-full mb-1 bg-white rounded-lg shadow-xl border z-50">
              <div className="p-2">
                <button
                  onClick={() => {
                    setShowStatusPicker(true);
                    setShowUserMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <Circle className="w-4 h-4" />
                  Set Status
                </button>
                <button
                  onClick={() => {
                    setShowUserSettings(true);
                    setShowUserMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <hr className="my-1" />
                <button
                  onClick={() => {
                    logout();
                    setShowUserMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {showStatusPicker && (
            <StatusPicker onClose={() => setShowStatusPicker(false)} />
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateChannel && (
        <CreateChannelModal
          workspaceId={currentWorkspaceId!}
          onClose={() => setShowCreateChannel(false)}
        />
      )}
      {showCreateWorkspace && (
        <CreateWorkspaceModal onClose={() => setShowCreateWorkspace(false)} />
      )}
      {showInviteMember && currentWorkspaceId && (
        <InviteMemberModal
          workspaceId={currentWorkspaceId}
          onClose={() => setShowInviteMember(false)}
        />
      )}
      {showUserSettings && (
        <UserSettingsModal onClose={() => setShowUserSettings(false)} />
      )}
      {showCreateGroupDm && currentWorkspaceId && (
        <CreateGroupDmModal
          workspaceId={currentWorkspaceId}
          onClose={() => setShowCreateGroupDm(false)}
        />
      )}
    </div>
  );
}
