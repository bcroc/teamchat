import { useEffect, useRef } from 'react';
import { useCallStore } from '../../stores/call';
import { useSocketStore } from '../../stores/socket';
import { SOCKET_EVENTS } from '@teamchat/shared';
import { Phone, PhoneOff, Video } from 'lucide-react';

export default function IncomingCallModal() {
  const { callId, caller, channelId, dmThreadId, declineCall, acceptCall } = useCallStore();
  const { socket } = useSocketStore();
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  // Play ringtone effect
  useEffect(() => {
    // Create a simple ringtone using Web Audio API
    const audioContext = new AudioContext();
    let oscillator: OscillatorNode | null = null;
    let gainNode: GainNode | null = null;
    let interval: NodeJS.Timeout;

    const playTone = () => {
      oscillator = audioContext.createOscillator();
      gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 440; // A4 note
      oscillator.type = 'sine';
      gainNode.gain.value = 0.1;

      oscillator.start();

      setTimeout(() => {
        oscillator?.stop();
      }, 200);
    };

    // Play tone every second
    playTone();
    interval = setInterval(playTone, 1000);

    return () => {
      clearInterval(interval);
      oscillator?.stop();
      audioContext.close();
    };
  }, []);

  const handleAccept = async () => {
    if (!callId) return;

    socket?.emit(SOCKET_EVENTS.CALL_ACCEPTED, { callId });
    await acceptCall(callId);
  };

  const handleDecline = () => {
    if (!callId) return;

    socket?.emit(SOCKET_EVENTS.CALL_DECLINED, { callId });
    declineCall();
  };

  const callType = channelId ? 'Group call' : 'Video call';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 text-center min-w-[300px]">
        {/* Caller avatar */}
        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
          {caller?.displayName?.charAt(0).toUpperCase() || '?'}
        </div>

        {/* Pulsing ring animation */}
        <div className="relative -mt-28 mb-4">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full border-4 border-primary-300 animate-ping opacity-75" />
          </div>
          <div className="w-24 h-24 mx-auto" /> {/* Spacer */}
        </div>

        <h2 className="text-xl font-bold mb-1">
          {caller?.displayName || 'Unknown caller'}
        </h2>
        <p className="text-gray-500 text-sm mb-1">{callType}</p>
        <p className="text-gray-400 text-xs mb-6 flex items-center justify-center gap-1">
          <Video className="w-3 h-3" />
          Incoming call...
        </p>

        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleDecline}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-all hover:scale-105 shadow-lg"
              title="Decline"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
            <span className="text-xs text-gray-500">Decline</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleAccept}
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white transition-all hover:scale-105 shadow-lg animate-pulse"
              title="Accept"
            >
              <Phone className="w-7 h-7" />
            </button>
            <span className="text-xs text-gray-500">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
