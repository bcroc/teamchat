/**
 * Connection Status Indicator Component
 *
 * Shows the current WebSocket connection status to the user.
 * Provides visual feedback for connection issues and retry attempts.
 */

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { useSocketStore, ConnectionStatus } from '../stores/socket';
import { clsx } from 'clsx';

interface StatusConfig {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  bgColor: string;
  animate?: boolean;
}

const STATUS_CONFIGS: Record<ConnectionStatus, StatusConfig> = {
  connected: {
    icon: Wifi,
    label: 'Connected',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  connecting: {
    icon: RefreshCw,
    label: 'Connecting...',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    animate: true,
  },
  reconnecting: {
    icon: RefreshCw,
    label: 'Reconnecting...',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    animate: true,
  },
  disconnected: {
    icon: WifiOff,
    label: 'Disconnected',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
  },
  error: {
    icon: AlertCircle,
    label: 'Connection Error',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
};

interface ConnectionStatusIndicatorProps {
  className?: string;
  showWhenConnected?: boolean;
}

export default function ConnectionStatusIndicator({
  className,
  showWhenConnected = false,
}: ConnectionStatusIndicatorProps) {
  const { connectionStatus, reconnectAttempt, lastError, socket } = useSocketStore();
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Auto-hide when connected (with delay for smooth transition)
  useEffect(() => {
    if (connectionStatus === 'connected') {
      // Show briefly when connected, then hide
      setIsVisible(true);
      const timer = setTimeout(() => {
        if (!showWhenConnected) {
          setIsVisible(false);
        }
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(true);
    }
  }, [connectionStatus, showWhenConnected]);

  // Don't render when hidden
  if (!isVisible && connectionStatus === 'connected') {
    return null;
  }

  const config = STATUS_CONFIGS[connectionStatus];
  const Icon = config.icon;

  const handleRetry = () => {
    // Get the current token and attempt to reconnect
    const token = localStorage.getItem('token');
    if (token && socket) {
      socket.connect();
    }
  };

  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-300',
        config.bgColor,
        className
      )}
      onMouseEnter={() => setShowDetails(true)}
      onMouseLeave={() => setShowDetails(false)}
    >
      <Icon
        className={clsx(
          'w-4 h-4',
          config.color,
          config.animate && 'animate-spin'
        )}
      />
      <span className={clsx('text-sm font-medium', config.color)}>
        {config.label}
        {connectionStatus === 'reconnecting' && reconnectAttempt > 0 && (
          <span className="ml-1 text-xs opacity-75">
            (Attempt {reconnectAttempt})
          </span>
        )}
      </span>

      {/* Error details tooltip */}
      {showDetails && lastError && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-gray-800 rounded-md shadow-lg text-xs text-gray-300 max-w-xs z-50">
          {lastError}
        </div>
      )}

      {/* Retry button when in error state */}
      {connectionStatus === 'error' && (
        <button
          onClick={handleRetry}
          className="ml-2 text-xs text-blue-400 hover:text-blue-300 underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Minimal connection dot indicator for tight spaces
 */
export function ConnectionDot({ className }: { className?: string }) {
  const connectionStatus = useSocketStore((s) => s.connectionStatus);

  const dotColors: Record<ConnectionStatus, string> = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500 animate-pulse',
    reconnecting: 'bg-yellow-500 animate-pulse',
    disconnected: 'bg-gray-400',
    error: 'bg-red-500',
  };

  return (
    <span
      className={clsx(
        'inline-block w-2 h-2 rounded-full',
        dotColors[connectionStatus],
        className
      )}
      title={STATUS_CONFIGS[connectionStatus].label}
    />
  );
}
