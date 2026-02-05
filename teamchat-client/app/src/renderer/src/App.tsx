import { useEffect } from 'react';
import { useAuthStore } from './stores/auth';
import { useSocketStore } from './stores/socket';
import { useMessageListener } from './hooks/useMessageListener';
import ErrorBoundary from './components/ErrorBoundary';
import ConnectionStatusIndicator from './components/ConnectionStatusIndicator';
import AuthPage from './pages/AuthPage';
import MainLayout from './layouts/MainLayout';
import { Toaster } from './components/ui/Toaster';

export default function App() {
  const { user, isLoading, checkAuth } = useAuthStore();
  const { connect, disconnect, connectionStatus } = useSocketStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Connect/disconnect socket based on auth state
  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('token');
      if (token) {
        connect(token);
      }
    } else {
      disconnect();
    }
  }, [user, connect, disconnect]);

  // Listen to socket messages and update unread counts
  useMessageListener();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {user ? (
        <>
          <MainLayout />
          {/* Show connection status when not connected */}
          {connectionStatus !== 'connected' && (
            <div className="fixed bottom-4 left-4 z-50">
              <ConnectionStatusIndicator />
            </div>
          )}
        </>
      ) : (
        <AuthPage />
      )}
      <Toaster />
    </ErrorBoundary>
  );
}
