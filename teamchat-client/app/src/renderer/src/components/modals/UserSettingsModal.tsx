import { useState, FormEvent, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from '../../stores/toast';
import { useAuthStore } from '../../stores/auth';
import { X, User, Bell, Monitor, Lock, Camera } from 'lucide-react';
import { clsx } from 'clsx';

interface UserSettingsModalProps {
  onClose: () => void;
}

type SettingsTab = 'profile' | 'notifications' | 'appearance' | 'privacy';

export default function UserSettingsModal({ onClose }: UserSettingsModalProps) {
  const queryClient = useQueryClient();
  const { user, updateUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // Profile form state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [status, setStatus] = useState(user?.status || '');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Notification settings
  const [desktopNotifications, setDesktopNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifyOnMention, setNotifyOnMention] = useState(true);
  const [notifyOnDm, setNotifyOnDm] = useState(true);

  // Appearance settings
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
  const [compactMode, setCompactMode] = useState(false);
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');

  const profileMutation = useMutation({
    mutationFn: () =>
      api.patch<{ user: typeof user }>('/users/me', {
        displayName,
        status: status || undefined,
      }),
    onSuccess: (data) => {
      if (data.user) {
        updateUser(data.user);
      }
      toast.success('Profile updated');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile');
    },
  });

  const handleProfileSubmit = (e: FormEvent) => {
    e.preventDefault();
    profileMutation.mutate();
  };

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('avatar', file);
      // Avatar upload would be handled here
      toast.success('Avatar updated');
    } catch {
      toast.error('Failed to upload avatar');
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-5 h-5" /> },
    { id: 'appearance', label: 'Appearance', icon: <Monitor className="w-5 h-5" /> },
    { id: 'privacy', label: 'Privacy', icon: <Lock className="w-5 h-5" /> },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <form onSubmit={handleProfileSubmit} className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div
                onClick={handleAvatarClick}
                className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-2xl font-bold cursor-pointer group"
              >
                {user?.displayName?.charAt(0).toUpperCase()}
                <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <div>
                <p className="font-medium">{user?.displayName}</p>
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  Change avatar
                </button>
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full px-4 py-2 border rounded-lg bg-gray-50 text-gray-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Email cannot be changed
              </p>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <input
                type="text"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                maxLength={100}
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={profileMutation.isPending}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {profileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-4">Desktop Notifications</h3>
              <div className="space-y-4">
                <label className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Enable desktop notifications</span>
                  <input
                    type="checkbox"
                    checked={desktopNotifications}
                    onChange={(e) => setDesktopNotifications(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Play notification sounds</span>
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-4">Notify me about...</h3>
              <div className="space-y-4">
                <label className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Mentions and replies</span>
                  <input
                    type="checkbox"
                    checked={notifyOnMention}
                    onChange={(e) => setNotifyOnMention(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Direct messages</span>
                  <input
                    type="checkbox"
                    checked={notifyOnDm}
                    onChange={(e) => setNotifyOnDm(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>
              </div>
            </div>

            <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
              Save Preferences
            </button>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-4">Theme</h3>
              <div className="flex gap-4">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={clsx(
                      'flex-1 py-3 px-4 rounded-lg border-2 transition-colors capitalize',
                      theme === t
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-4">Font Size</h3>
              <div className="flex gap-4">
                {(['small', 'medium', 'large'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setFontSize(size)}
                    className={clsx(
                      'flex-1 py-3 px-4 rounded-lg border-2 transition-colors capitalize',
                      fontSize === size
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Compact mode</span>
              <input
                type="checkbox"
                checked={compactMode}
                onChange={(e) => setCompactMode(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </label>

            <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
              Save Preferences
            </button>
          </div>
        );

      case 'privacy':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-4">Activity Status</h3>
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-700 block">Show when you're online</span>
                  <span className="text-xs text-gray-500">Others will see when you're active</span>
                </div>
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </label>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-4">Read Receipts</h3>
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-700 block">Send read receipts</span>
                  <span className="text-xs text-gray-500">Let others know when you've read their messages</span>
                </div>
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </label>
            </div>

            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium text-red-600 mb-4">Danger Zone</h3>
              <button className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50">
                Delete Account
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-modal-backdrop">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex overflow-hidden animate-modal-enter">
        {/* Sidebar */}
        <div className="w-56 bg-gray-50 border-r p-4 flex-shrink-0">
          <h2 className="text-lg font-bold mb-4">Settings</h2>
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                  activeTab === tab.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                {tab.icon}
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-lg font-bold">
              {tabs.find((t) => t.id === activeTab)?.label}
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
