import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/workspace';
import Sidebar from '../components/Sidebar';
import ChatArea from '../components/ChatArea';
import ThreadPanel from '../components/ThreadPanel';
import PinnedMessagesPanel from '../components/PinnedMessagesPanel';
import SavedMessagesPanel from '../components/SavedMessagesPanel';
import ChannelMembersPanel from '../components/ChannelMembersPanel';
import QuickSwitcher from '../components/QuickSwitcher';
import KeyboardShortcutsPanel from '../components/KeyboardShortcutsPanel';
import CallOverlay from '../components/call/CallOverlay';
import IncomingCallModal from '../components/call/IncomingCallModal';
import { useCallStore } from '../stores/call';
import type { Channel } from '@teamchat/shared';

export default function MainLayout() {
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  const {
    currentWorkspaceId,
    currentChannelId,
    setCurrentWorkspace,
    threadParentId,
    rightPanel,
    closeRightPanel,
  } = useWorkspaceStore();
  const callState = useCallStore((s) => s.state);

  // Fetch current channel for pinned messages panel
  const { data: channelData } = useQuery({
    queryKey: ['channel', currentChannelId],
    queryFn: () => api.get<{ channel: Channel }>(`/channels/${currentChannelId}`),
    enabled: !!currentChannelId && (rightPanel === 'pinned' || rightPanel === 'members'),
  });

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Quick switcher: Cmd+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowQuickSwitcher(true);
      }
      // Keyboard shortcuts: Cmd+/
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setShowKeyboardShortcuts((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch user's workspaces
  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.get<{ workspaces: Array<{ id: string; name: string }> }>('/workspaces'),
  });

  // Auto-select first workspace if none selected
  useEffect(() => {
    if (workspacesData?.workspaces.length && !currentWorkspaceId) {
      setCurrentWorkspace(workspacesData.workspaces[0].id);
    }
  }, [workspacesData, currentWorkspaceId, setCurrentWorkspace]);

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {currentWorkspaceId ? (
            <ChatArea />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Welcome to TeamChat</h2>
                <p>Select or create a workspace to get started</p>
              </div>
            </div>
          )}
        </div>

        {/* Right panels */}
        {rightPanel === 'thread' && threadParentId && (
          <ThreadPanel parentId={threadParentId} />
        )}
        {rightPanel === 'pinned' && currentChannelId && channelData?.channel && (
          <PinnedMessagesPanel
            channelId={currentChannelId}
            channelName={channelData.channel.name}
            onClose={closeRightPanel}
          />
        )}
        {rightPanel === 'saved' && (
          <SavedMessagesPanel onClose={closeRightPanel} />
        )}
        {rightPanel === 'members' && currentChannelId && channelData?.channel && (
          <ChannelMembersPanel
            channelId={currentChannelId}
            channelName={channelData.channel.name}
            onClose={closeRightPanel}
          />
        )}
      </div>

      {/* Call overlay (when in call) */}
      {callState === 'in_call' && <CallOverlay />}

      {/* Incoming call modal */}
      {callState === 'ringing_incoming' && <IncomingCallModal />}

      {/* Quick switcher */}
      {showQuickSwitcher && (
        <QuickSwitcher onClose={() => setShowQuickSwitcher(false)} />
      )}

      {/* Keyboard shortcuts */}
      {showKeyboardShortcuts && (
        <KeyboardShortcutsPanel onClose={() => setShowKeyboardShortcuts(false)} />
      )}
    </div>
  );
}
