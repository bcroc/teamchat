import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Draft {
  body: string;
  updatedAt: number;
}

interface DraftsState {
  // Key format: "channel:{id}" or "dm:{id}" or "thread:{id}"
  drafts: Record<string, Draft>;

  // Actions
  getDraft: (key: string) => string;
  setDraft: (key: string, body: string) => void;
  clearDraft: (key: string) => void;
  clearOldDrafts: () => void;
}

// Drafts older than 7 days are considered stale
const DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const useDraftsStore = create<DraftsState>()(
  persist(
    (set, get) => ({
      drafts: {},

      getDraft: (key: string) => {
        const draft = get().drafts[key];
        if (!draft) return '';

        // Check if draft is stale
        if (Date.now() - draft.updatedAt > DRAFT_MAX_AGE) {
          get().clearDraft(key);
          return '';
        }

        return draft.body;
      },

      setDraft: (key: string, body: string) => {
        set((state) => {
          // Don't store empty drafts
          if (!body.trim()) {
            const { [key]: _, ...rest } = state.drafts;
            return { drafts: rest };
          }

          return {
            drafts: {
              ...state.drafts,
              [key]: {
                body,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      clearDraft: (key: string) => {
        set((state) => {
          const { [key]: _, ...rest } = state.drafts;
          return { drafts: rest };
        });
      },

      clearOldDrafts: () => {
        set((state) => {
          const now = Date.now();
          const freshDrafts: Record<string, Draft> = {};

          for (const [key, draft] of Object.entries(state.drafts)) {
            if (now - draft.updatedAt < DRAFT_MAX_AGE) {
              freshDrafts[key] = draft;
            }
          }

          return { drafts: freshDrafts };
        });
      },
    }),
    {
      name: 'drafts-storage',
    }
  )
);

// Helper to create draft keys
export const getDraftKey = (scope: {
  channelId?: string;
  dmThreadId?: string;
  parentId?: string;
}) => {
  if (scope.parentId) return `thread:${scope.parentId}`;
  if (scope.channelId) return `channel:${scope.channelId}`;
  if (scope.dmThreadId) return `dm:${scope.dmThreadId}`;
  return '';
};
