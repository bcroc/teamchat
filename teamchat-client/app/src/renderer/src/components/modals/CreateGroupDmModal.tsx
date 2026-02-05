import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useWorkspaceStore } from '../../stores/workspace';
import { toast } from '../../stores/toast';
import { X, Users, Search, Check } from 'lucide-react';
import { clsx } from 'clsx';

interface CreateGroupDmModalProps {
  workspaceId: string;
  onClose: () => void;
}

interface User {
  id: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
}

interface Member {
  user: User;
  role: string;
}

export default function CreateGroupDmModal({ workspaceId, onClose }: CreateGroupDmModalProps) {
  const queryClient = useQueryClient();
  const { setCurrentDmThread } = useWorkspaceStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');

  // Fetch workspace members
  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () =>
      api.get<{ members: Member[] }>(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  });

  const members = membersData?.members || [];

  // Filter members based on search
  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const notSelected = !selectedUsers.some((u) => u.id === m.user.id);
    return matchesSearch && notSelected;
  });

  // Create group DM mutation
  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ dmThread: { id: string } }>('/dms/group', {
        workspaceId,
        userIds: selectedUsers.map((u) => u.id),
        name: groupName.trim() || undefined,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dms', workspaceId] });
      toast.success('Group DM created');
      setCurrentDmThread(data.dmThread.id);
      onClose();
    },
    onError: () => {
      toast.error('Failed to create group DM');
    },
  });

  const handleToggleUser = (user: User) => {
    if (selectedUsers.some((u) => u.id === user.id)) {
      setSelectedUsers(selectedUsers.filter((u) => u.id !== user.id));
    } else if (selectedUsers.length < 8) {
      setSelectedUsers([...selectedUsers, user]);
    } else {
      toast.error('Maximum 8 participants (plus yourself)');
    }
  };

  const handleRemoveUser = (userId: string) => {
    setSelectedUsers(selectedUsers.filter((u) => u.id !== userId));
  };

  const handleCreate = () => {
    if (selectedUsers.length < 2) {
      toast.error('Select at least 2 participants');
      return;
    }
    createMutation.mutate();
  };

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-modal-backdrop">
      <div
        ref={containerRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden animate-modal-enter"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-bold">New Group Message</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Group name (optional) */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Group name (optional)
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g., Project Team, Weekend Plans"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              maxLength={100}
            />
          </div>

          {/* Selected users */}
          {selectedUsers.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Selected ({selectedUsers.length}/8)
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-1.5 px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-sm"
                  >
                    <div className="w-5 h-5 rounded-full bg-primary-500 text-white flex items-center justify-center text-xs">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <span>{user.displayName}</span>
                    <button
                      onClick={() => handleRemoveUser(user.id)}
                      className="p-0.5 hover:bg-primary-200 rounded-full"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Add people
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Member list */}
          <div className="max-h-[250px] overflow-y-auto border rounded-lg">
            {filteredMembers.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                {searchQuery ? 'No members found' : 'No more members to add'}
              </div>
            ) : (
              filteredMembers.map((member) => {
                const isSelected = selectedUsers.some((u) => u.id === member.user.id);

                return (
                  <button
                    key={member.user.id}
                    onClick={() => handleToggleUser(member.user)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left',
                      isSelected && 'bg-primary-50'
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary-500 text-white flex items-center justify-center font-medium">
                      {member.user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {member.user.displayName}
                      </div>
                      {member.user.email && (
                        <div className="text-sm text-gray-500 truncate">
                          {member.user.email}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-5 h-5 text-primary-600" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <p className="text-sm text-gray-500">
            {selectedUsers.length < 2
              ? 'Select at least 2 people'
              : `${selectedUsers.length + 1} people in group`}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={selectedUsers.length < 2 || createMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
