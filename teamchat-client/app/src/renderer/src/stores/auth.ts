/**
 * Authentication Store
 *
 * Manages user authentication state including login, signup, logout,
 * and session validation. The JWT token is persisted using Electron's
 * secure storage (safeStorage API) for XSS protection.
 *
 * @module apps/desktop/src/renderer/src/stores/auth
 */

import { create } from 'zustand';
import { api, setTokenGetter } from '../lib/api';
import type { AuthUser, LoginResponse } from '@teamchat/shared';

/**
 * Token storage abstraction - uses Electron's secure storage when available,
 * falls back to localStorage for web/dev environments
 */
const tokenStorage = {
  async get(): Promise<string | null> {
    if (window.electronAPI?.secureStorage) {
      return await window.electronAPI.secureStorage.getToken();
    }
    return localStorage.getItem('token');
  },

  async set(token: string): Promise<void> {
    if (window.electronAPI?.secureStorage) {
      await window.electronAPI.secureStorage.setToken(token);
    } else {
      localStorage.setItem('token', token);
    }
  },

  async remove(): Promise<void> {
    if (window.electronAPI?.secureStorage) {
      await window.electronAPI.secureStorage.deleteToken();
    } else {
      localStorage.removeItem('token');
    }
  },
};

// Configure API client to use our token getter
setTokenGetter(() => tokenStorage.get());

/**
 * Authentication state and actions.
 */
interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  checkAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: Partial<AuthUser>) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  error: null,

  checkAuth: async () => {
    try {
      const token = await tokenStorage.get();
      if (!token) {
        set({ user: null, isLoading: false });
        return;
      }

      const { user } = await api.get<{ user: AuthUser }>('/auth/me');
      set({ user, isLoading: false });
    } catch {
      await tokenStorage.remove();
      set({ user: null, isLoading: false });
    }
  },

  login: async (email, password) => {
    try {
      set({ error: null, isLoading: true });
      const { user, token } = await api.post<LoginResponse>('/auth/login', {
        email,
        password,
      });

      if (token) {
        await tokenStorage.set(token);
      }

      set({ user, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Login failed',
        isLoading: false,
      });
      throw err;
    }
  },

  signup: async (email, password, displayName) => {
    try {
      set({ error: null, isLoading: true });
      const { user, token } = await api.post<LoginResponse>('/auth/signup', {
        email,
        password,
        displayName,
      });

      if (token) {
        await tokenStorage.set(token);
      }

      set({ user, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Signup failed',
        isLoading: false,
      });
      throw err;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      await tokenStorage.remove();
      set({ user: null });
    }
  },

  updateUser: (updates) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    }));
  },

  clearError: () => set({ error: null }),
}));
