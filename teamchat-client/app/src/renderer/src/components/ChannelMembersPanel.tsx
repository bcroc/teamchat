import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSocketStore } from '../stores/socket';
import { X, Users, Crown, Shield, Circle } from 'lucide-react';
import { clsx } from 'clsx';
import type { User } from '@teamchat/shared';

interface ChannelMembersPanelProps {
  channelId: string;
  channelName: string;
  onClose: () => void;
}

interface ChannelMember {
  channelId: string;
  userId: string;
  joinedAt: Date;
  user: Pick<User, 'id' | 'displayName' | 'email' | 'avatarUrl'>;
}

interface WorkspaceMemberWithRole {
  user: Pick<User, 'id' | 'displayName' | 'email' | 'avatarUrl'>;
  role: 'owner' | 'admin' | 'member';
}

export default function ChannelMembersPanel({
  channelId,
  channelName,
  onClose,
}: ChannelMembersPanelProps) {
  const { onlineUsers } = useSocketStore();

  const { data, isLoading, error } = useQuery({
    queryKey: ['channel-members', channelId],
    queryFn: () =>
      api.get<{ members: ChannelMember[] }>(`/channels/${channelId}/members`),
  });

  const members = data?.members || [];
  const onlineCount = members.filter((m) => onlineUsers.has(m.user.id)).length;

  // Sort: online first, then alphabetically
  const sortedMembers = [...members].sort((a, b) => {
    const aOnline = onlineUsers.has(a.user.id);
    const bOnline = onlineUsers.has(b.user.id);
    if (aOnline !== bOnline) return aOnline ? -1 : 1;
    return a.user.displayName.localeCompare(b.user.displayName);
  });

  return (
    <div className="h-full flex flex-col bg-white border-l w-72">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold">Members</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Channel info */}
      <div className="px-4 py-2 bg-gray-50 border-b text-sm">
        <span className="text-gray-600">#{channelName}</span>
        <span className="text-gray-400 ml-2">
          {members.length} member{members.length !== 1 ? 's' : ''}
          {onlineCount > 0 && ` (${onlineCount} online)`}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-red-500">
            Failed to load members
          </div>
        )}

        {!isLoading && members.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No members found</p>
          </div>
        )}

        {/* Online section */}
        {sortedMembers.filter((m) => onlineUsers.has(m.user.id)).length > 0 && (
          <div className="p-2">
            <div className="px-2 py-1 text-xs font-medium text-gray-500 uppercase">
              Online - {onlineCount}
            </div>
            {sortedMembers
              .filter((m) => onlineUsers.has(m.user.id))
              .map((member) => (
                <MemberItem
                  key={member.userId}
                  member={member}
                  isOnline={true}
                />
              ))}
          </div>
        )}

        {/* Offline section */}
        {sortedMembers.filter((m) => !onlineUsers.has(m.user.id)).length > 0 && (
          <div className="p-2">
            <div className="px-2 py-1 text-xs font-medium text-gray-500 uppercase">
              Offline - {members.length - onlineCount}
            </div>
            {sortedMembers
              .filter((m) => !onlineUsers.has(m.user.id))
              .map((member) => (
                <MemberItem
                  key={member.userId}
                  member={member}
                  isOnline={false}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MemberItem({
  member,
  isOnline,
}: {
  member: ChannelMember;
  isOnline: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50">
      {/* Avatar with status */}
      <div className="relative flex-shrink-0">
        <div
          className={clsx(
            'w-8 h-8 rounded-lg flex items-center justify-center text-white font-medium',
            isOnline ? 'bg-primary-500' : 'bg-gray-400'
          )}
        >
          {member.user.displayName.charAt(0).toUpperCase()}
        </div>
        <div
          className={clsx(
            'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white',
            isOnline ? 'bg-green-500' : 'bg-gray-400'
          )}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span
            className={clsx(
              'font-medium text-sm truncate',
              isOnline ? 'text-gray-900' : 'text-gray-500'
            )}
          >
            {member.user.displayName}
          </span>
        </div>
        <div className="text-xs text-gray-400 truncate">
          {member.user.email}
        </div>
      </div>
    </div>
  );
}
