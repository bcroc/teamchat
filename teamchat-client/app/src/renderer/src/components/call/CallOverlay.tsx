import { useEffect, useRef } from 'react';
import { useCallStore } from '../../stores/call';
import { useSocketStore } from '../../stores/socket';
import { SOCKET_EVENTS } from '@teamchat/shared';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  PhoneOff,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import ScreenSharePicker from './ScreenSharePicker';

export default function CallOverlay() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showScreenPicker, setShowScreenPicker] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const {
    callId,
    localStream,
    localScreenStream,
    localMediaState,
    participants,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    leaveCall,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handleParticipantJoined,
    handleParticipantLeft,
  } = useCallStore();

  const { socket } = useSocketStore();

  // Set up local video
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Set up socket event handlers for WebRTC signaling
  useEffect(() => {
    if (!socket || !callId) return;

    // Join call room
    socket.emit(SOCKET_EVENTS.CALL_JOIN, { callId });

    const handleOfferEvent = async (data: any) => {
      const answer = await handleOffer(data);
      if (answer) {
        socket.emit(SOCKET_EVENTS.CALL_ANSWER, {
          callId,
          toUserId: data.fromUserId,
          sdp: answer,
        });
      }
    };

    const handleAnswerEvent = async (data: any) => {
      await handleAnswer(data);
    };

    const handleIceEvent = async (data: any) => {
      await handleIceCandidate(data);
    };

    const handleParticipantJoinedEvent = (data: any) => {
      handleParticipantJoined(data);
      // Send offer to new participant
      // This would be implemented with proper peer connection creation
    };

    const handleParticipantLeftEvent = (data: any) => {
      handleParticipantLeft(data);
    };

    socket.on(SOCKET_EVENTS.CALL_OFFER, handleOfferEvent);
    socket.on(SOCKET_EVENTS.CALL_ANSWER, handleAnswerEvent);
    socket.on(SOCKET_EVENTS.CALL_ICE, handleIceEvent);
    socket.on(SOCKET_EVENTS.CALL_PARTICIPANT_JOINED, handleParticipantJoinedEvent);
    socket.on(SOCKET_EVENTS.CALL_PARTICIPANT_LEFT, handleParticipantLeftEvent);

    return () => {
      socket.off(SOCKET_EVENTS.CALL_OFFER, handleOfferEvent);
      socket.off(SOCKET_EVENTS.CALL_ANSWER, handleAnswerEvent);
      socket.off(SOCKET_EVENTS.CALL_ICE, handleIceEvent);
      socket.off(SOCKET_EVENTS.CALL_PARTICIPANT_JOINED, handleParticipantJoinedEvent);
      socket.off(SOCKET_EVENTS.CALL_PARTICIPANT_LEFT, handleParticipantLeftEvent);
      socket.emit(SOCKET_EVENTS.CALL_LEAVE, { callId });
    };
  }, [socket, callId, handleOffer, handleAnswer, handleIceCandidate, handleParticipantJoined, handleParticipantLeft]);

  const handleToggleScreenShare = async () => {
    if (localMediaState.screenShareEnabled) {
      stopScreenShare();
      socket?.emit(SOCKET_EVENTS.CALL_SCREENSHARE_STOP, { callId });
    } else {
      setShowScreenPicker(true);
    }
  };

  const handleScreenSelected = async (sourceId: string) => {
    setShowScreenPicker(false);
    try {
      await startScreenShare();
      socket?.emit(SOCKET_EVENTS.CALL_SCREENSHARE_START, { callId });
    } catch (err) {
      console.error('Failed to start screen share:', err);
    }
  };

  const participantList = Array.from(participants.values());

  if (isExpanded) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-gray-800">
          <span className="text-white font-medium">
            In call ({participantList.length + 1} participants)
          </span>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-2 hover:bg-gray-700 rounded-lg text-white"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        </div>

        {/* Video grid */}
        <div className="flex-1 p-4 grid gap-4 auto-rows-fr" style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))`,
        }}>
          {/* Local video */}
          <div className="relative bg-gray-800 rounded-xl overflow-hidden">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={clsx(
                'w-full h-full object-cover',
                !localMediaState.videoEnabled && 'hidden'
              )}
            />
            {!localMediaState.videoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 rounded-full bg-primary-600 flex items-center justify-center text-white text-3xl font-bold">
                  You
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-white text-sm">
              You {!localMediaState.audioEnabled && '(muted)'}
            </div>
          </div>

          {/* Remote participants */}
          {participantList.map((participant) => (
            <div key={participant.userId} className="relative bg-gray-800 rounded-xl overflow-hidden">
              {participant.stream ? (
                <ParticipantVideo stream={participant.stream} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 rounded-full bg-gray-600 flex items-center justify-center text-white text-3xl font-bold">
                    {participant.displayName.charAt(0).toUpperCase()}
                  </div>
                </div>
              )}
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-white text-sm">
                {participant.displayName} {!participant.mediaState.audioEnabled && '(muted)'}
              </div>
              {participant.isSpeaking && (
                <div className="absolute inset-0 border-4 border-green-500 rounded-xl pointer-events-none" />
              )}
            </div>
          ))}
        </div>

        {/* Screen share display */}
        {localScreenStream && (
          <div className="absolute top-20 left-4 w-64 h-36 bg-gray-800 rounded-lg overflow-hidden shadow-lg">
            <video
              autoPlay
              playsInline
              ref={(el) => {
                if (el) el.srcObject = localScreenStream;
              }}
              className="w-full h-full object-contain"
            />
            <span className="absolute bottom-1 left-1 text-xs text-white bg-black/50 px-1 rounded">
              Your screen
            </span>
          </div>
        )}

        {/* Controls */}
        <CallControls
          localMediaState={localMediaState}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={handleToggleScreenShare}
          onLeave={leaveCall}
        />

        {/* Screen picker */}
        {showScreenPicker && (
          <ScreenSharePicker
            onSelect={handleScreenSelected}
            onClose={() => setShowScreenPicker(false)}
          />
        )}
      </div>
    );
  }

  // Minimized call bar
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-800 rounded-2xl shadow-2xl p-2 flex items-center gap-2 z-50">
      <div className="px-4 text-white text-sm">
        In call ({participantList.length + 1})
      </div>

      <button
        onClick={toggleAudio}
        className={clsx(
          'call-control',
          localMediaState.audioEnabled ? 'call-control-active' : 'call-control-muted'
        )}
        title={localMediaState.audioEnabled ? 'Mute' : 'Unmute'}
      >
        {localMediaState.audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>

      <button
        onClick={toggleVideo}
        className={clsx(
          'call-control',
          localMediaState.videoEnabled ? 'call-control-active' : 'call-control-muted'
        )}
        title={localMediaState.videoEnabled ? 'Turn off camera' : 'Turn on camera'}
      >
        {localMediaState.videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </button>

      <button
        onClick={handleToggleScreenShare}
        className={clsx(
          'call-control',
          localMediaState.screenShareEnabled ? 'call-control-muted' : 'call-control-active'
        )}
        title={localMediaState.screenShareEnabled ? 'Stop sharing' : 'Share screen'}
      >
        <MonitorUp className="w-5 h-5" />
      </button>

      <button
        onClick={() => setIsExpanded(true)}
        className="call-control-active"
        title="Expand"
      >
        <Maximize2 className="w-5 h-5" />
      </button>

      <button onClick={leaveCall} className="call-control-end" title="Leave call">
        <PhoneOff className="w-5 h-5" />
      </button>
    </div>
  );
}

function CallControls({
  localMediaState,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onLeave,
}: {
  localMediaState: { audioEnabled: boolean; videoEnabled: boolean; screenShareEnabled: boolean };
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4 p-4 bg-gray-800">
      <button
        onClick={onToggleAudio}
        className={clsx(
          'call-control',
          localMediaState.audioEnabled ? 'call-control-active' : 'call-control-muted'
        )}
        title={localMediaState.audioEnabled ? 'Mute' : 'Unmute'}
      >
        {localMediaState.audioEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
      </button>

      <button
        onClick={onToggleVideo}
        className={clsx(
          'call-control',
          localMediaState.videoEnabled ? 'call-control-active' : 'call-control-muted'
        )}
        title={localMediaState.videoEnabled ? 'Turn off camera' : 'Turn on camera'}
      >
        {localMediaState.videoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
      </button>

      <button
        onClick={onToggleScreenShare}
        className={clsx(
          'call-control',
          localMediaState.screenShareEnabled ? 'call-control-muted' : 'call-control-active'
        )}
        title={localMediaState.screenShareEnabled ? 'Stop sharing' : 'Share screen'}
      >
        <MonitorUp className="w-6 h-6" />
      </button>

      <button onClick={onLeave} className="call-control-end" title="Leave call">
        <PhoneOff className="w-6 h-6" />
      </button>
    </div>
  );
}

function ParticipantVideo({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-cover"
    />
  );
}
