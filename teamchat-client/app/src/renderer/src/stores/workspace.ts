/**
 * Workspace Navigation Store
 *
 * Manages the current workspace, channel, and DM selection state.
 * Also controls the right panel display (threads, pinned messages,
 * saved messages, member list).
 *
 * The current workspace ID is persisted to localStorage so users
 * return to their last active workspace on app restart.
 *
 * @module apps/desktop/src/renderer/src/stores/workspace
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Workspace, Channel, DmThread } from '@teamchat/shared';

/** Types of panels that can be displayed on the right side */
type RightPanelType = 'thread' | 'pinned' | 'saved' | 'members' | null;

/**
 * Workspace navigation state and panel management.
 */
interface WorkspaceState {
  currentWorkspaceId: string | null;
  currentChannelId: string | null;
  currentDmThreadId: string | null;
  threadParentId: string | null; // For thread side panel
  rightPanel: RightPanelType;

  // Actions
  setCurrentWorkspace: (workspaceId: string | null) => void;
  setCurrentChannel: (channelId: string | null) => void;
  setCurrentDmThread: (dmThreadId: string | null) => void;
  openThread: (parentId: string) => void;
  closeThread: () => void;
  openPinnedMessages: () => void;
  openSavedMessages: () => void;
  openMembersPanel: () => void;
  closeRightPanel: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      currentWorkspaceId: null,
      currentChannelId: null,
      currentDmThreadId: null,
      threadParentId: null,
      rightPanel: null,

      setCurrentWorkspace: (workspaceId) =>
        set({
          currentWorkspaceId: workspaceId,
          currentChannelId: null,
          currentDmThreadId: null,
          threadParentId: null,
          rightPanel: null,
        }),

      setCurrentChannel: (channelId) =>
        set({
          currentChannelId: channelId,
          currentDmThreadId: null,
          threadParentId: null,
          rightPanel: null,
        }),

      setCurrentDmThread: (dmThreadId) =>
        set({
          currentDmThreadId: dmThreadId,
          currentChannelId: null,
          threadParentId: null,
          rightPanel: null,
        }),

      openThread: (parentId) =>
        set({ threadParentId: parentId, rightPanel: 'thread' }),

      closeThread: () =>
        set({ threadParentId: null, rightPanel: null }),

      openPinnedMessages: () =>
        set({ rightPanel: 'pinned', threadParentId: null }),

      openSavedMessages: () =>
        set({ rightPanel: 'saved', threadParentId: null }),

      openMembersPanel: () =>
        set({ rightPanel: 'members', threadParentId: null }),

      closeRightPanel: () =>
        set({ rightPanel: null, threadParentId: null }),
    }),
    {
      name: 'workspace-storage',
      partialize: (state) => ({
        currentWorkspaceId: state.currentWorkspaceId,
      }),
    }
  )
);
