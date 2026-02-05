/**
 * Voice/Video Call Store
 *
 * Manages WebRTC call state including:
 * - Call lifecycle (idle → ringing → connecting → in_call → ended)
 * - Peer connections using perfect negotiation pattern
 * - Local and remote media streams
 * - Screen sharing with Electron display picker
 * - ICE candidate exchange via Socket.io signaling
 *
 * This store implements a mesh topology for group calls where each
 * participant maintains a direct peer connection to every other participant.
 *
 * @module apps/desktop/src/renderer/src/stores/call
 */

import { create } from 'zustand';
import { SOCKET_EVENTS } from '@teamchat/shared';
import type { ClientCallState, CallMediaState, IceServer } from '@teamchat/shared';
import { api } from '../lib/api';

/**
 * Remote participant state including their media streams.
 */
interface Participant {
  userId: string;
  displayName: string;
  mediaState: CallMediaState;
  stream: MediaStream | null;
  screenStream: MediaStream | null;
  isSpeaking: boolean;
  connectionState: RTCPeerConnectionState;
}

/**
 * WebRTC peer connection with perfect negotiation state flags.
 * These flags prevent offer collision in simultaneous negotiations.
 */
interface PeerConnectionData {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
}

/** Information about the user who initiated an incoming call */
interface CallerInfo {
  userId: string;
  displayName: string;
}

interface CallState {
  state: ClientCallState;
  callId: string | null;
  channelId: string | null;
  dmThreadId: string | null;
  caller: CallerInfo | null; // Who initiated the call (for incoming calls)
  participants: Map<string, Participant>;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  localMediaState: CallMediaState;
  iceServers: IceServer[];
  error: string | null;
  currentUserId: string | null;

  // Peer connections
  peerConnections: Map<string, PeerConnectionData>;

  // Socket reference (set externally)
  socket: any;
  setSocket: (socket: any) => void;

  // Actions
  initCall: (userId: string) => void;
  startCall: (scope: { channelId?: string; dmThreadId?: string }, options?: { withVideo?: boolean }) => Promise<void>;
  joinCall: (callId: string) => Promise<void>;
  acceptCall: (callId: string) => Promise<void>;
  declineCall: () => void;
  leaveCall: () => Promise<void>;
  endCall: () => Promise<void>;

  // Media
  toggleAudio: () => void;
  toggleVideo: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;

  // Signaling handlers
  setIncomingCall: (data: { callId: string; channelId?: string; dmThreadId?: string; fromUserId: string; fromDisplayName: string }) => void;
  handleParticipantJoined: (data: { userId: string; displayName: string }) => Promise<void>;
  handleParticipantLeft: (data: { userId: string }) => void;
  handleOffer: (data: { callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }) => Promise<void>;
  handleAnswer: (data: { callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }) => Promise<void>;
  handleIceCandidate: (data: { callId: string; fromUserId: string; candidate: RTCIceCandidateInit }) => Promise<void>;
  handleMediaStateUpdate: (data: { userId: string; audioEnabled: boolean; videoEnabled: boolean; screenShareEnabled: boolean }) => void;
  reset: () => void;
}

const DEFAULT_ICE_SERVERS: IceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

const initialState = {
  state: 'idle' as ClientCallState,
  callId: null,
  channelId: null,
  dmThreadId: null,
  caller: null,
  participants: new Map(),
  localStream: null,
  localScreenStream: null,
  localMediaState: {
    audioEnabled: true,
    videoEnabled: false,
    screenShareEnabled: false,
  },
  iceServers: DEFAULT_ICE_SERVERS,
  error: null,
  peerConnections: new Map(),
  socket: null,
  currentUserId: null,
};

export const useCallStore = create<CallState>((set, get) => ({
  ...initialState,

  setSocket: (socket) => set({ socket }),

  initCall: (userId) => set({ currentUserId: userId }),

  createPeerConnection: (remoteUserId: string): PeerConnectionData => {
    const { iceServers, localStream, localScreenStream, socket, callId, currentUserId } = get();

    const pc = new RTCPeerConnection({
      iceServers: iceServers as RTCIceServer[],
      iceCandidatePoolSize: 10,
    });

    const pcData: PeerConnectionData = {
      pc,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
    };

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    if (localScreenStream) {
      localScreenStream.getTracks().forEach((track) => {
        pc.addTrack(track, localScreenStream);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit(SOCKET_EVENTS.CALL_ICE, {
          callId,
          toUserId: remoteUserId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Handle incoming tracks
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;

      set((state) => {
        const participant = state.participants.get(remoteUserId);
        if (!participant) return state;

        const updated = new Map(state.participants);
        // Check if it's a screen share track
        const isScreenShare = event.track.label.toLowerCase().includes('screen') ||
          stream.id.toLowerCase().includes('screen');

        if (isScreenShare) {
          updated.set(remoteUserId, { ...participant, screenStream: stream });
        } else {
          updated.set(remoteUserId, { ...participant, stream });
        }

        return { participants: updated };
      });
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      set((state) => {
        const participant = state.participants.get(remoteUserId);
        if (!participant) return state;

        const updated = new Map(state.participants);
        updated.set(remoteUserId, { ...participant, connectionState: pc.connectionState });
        return { participants: updated };
      });

      if (pc.connectionState === 'failed') {
        pc.restartIce();
      }
    };

    // Handle negotiation needed (perfect negotiation pattern)
    pc.onnegotiationneeded = async () => {
      const pcData = get().peerConnections.get(remoteUserId);
      if (!pcData) return;

      try {
        pcData.makingOffer = true;
        await pc.setLocalDescription();

        if (socket && pc.localDescription) {
          socket.emit(SOCKET_EVENTS.CALL_OFFER, {
            callId,
            toUserId: remoteUserId,
            sdp: pc.localDescription,
          });
        }
      } catch (err) {
        console.error('Negotiation error:', err);
      } finally {
        pcData.makingOffer = false;
      }
    };

    // Handle ICE connection state
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    };

    return pcData;
  },

  startCall: async (scope, options) => {
    const withVideo = options?.withVideo ?? false;

    try {
      set({
        state: 'ringing_outgoing',
        error: null,
        ...scope,
        localMediaState: { ...get().localMediaState, videoEnabled: withVideo },
      });

      // Get ICE servers and start call via API
      const { callSession, iceServers } = await api.post<{
        callSession: { id: string };
        iceServers: IceServer[];
      }>('/calls/start', {
        scopeType: scope.channelId ? 'channel' : 'dm',
        ...scope,
      });

      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withVideo,
      });

      set({
        callId: callSession.id,
        iceServers: iceServers || DEFAULT_ICE_SERVERS,
        state: 'in_call',
        localStream: stream,
      });

      // Join socket room
      const { socket } = get();
      if (socket) {
        socket.emit(SOCKET_EVENTS.CALL_JOIN, { callId: callSession.id });
      }
    } catch (err) {
      set({
        state: 'idle',
        error: err instanceof Error ? err.message : 'Failed to start call',
      });
      throw err;
    }
  },

  joinCall: async (callId) => {
    try {
      set({ state: 'connecting', callId, error: null });

      const { callSession, iceServers } = await api.post<{
        callSession: {
          id: string;
          channelId?: string;
          dmThreadId?: string;
          participants?: Array<{ user: { id: string; displayName: string } }>;
        };
        iceServers: IceServer[];
      }>(`/calls/${callId}/join`);

      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: get().localMediaState.videoEnabled,
      });

      // Initialize participants from existing call members
      const participants = new Map<string, Participant>();
      if (callSession.participants) {
        for (const p of callSession.participants) {
          if (p.user.id !== get().currentUserId) {
            participants.set(p.user.id, {
              userId: p.user.id,
              displayName: p.user.displayName,
              mediaState: { audioEnabled: true, videoEnabled: false, screenShareEnabled: false },
              stream: null,
              screenStream: null,
              isSpeaking: false,
              connectionState: 'new',
            });
          }
        }
      }

      set({
        iceServers: iceServers || DEFAULT_ICE_SERVERS,
        channelId: callSession.channelId || null,
        dmThreadId: callSession.dmThreadId || null,
        localStream: stream,
        state: 'in_call',
        participants,
      });

      // Join socket room and create peer connections
      const { socket, currentUserId } = get();
      if (socket) {
        socket.emit(SOCKET_EVENTS.CALL_JOIN, { callId });

        // Create peer connections for existing participants
        for (const [userId] of participants) {
          const pcData = (get() as any).createPeerConnection(userId);
          set((state) => {
            const pcs = new Map(state.peerConnections);
            pcs.set(userId, pcData);
            return { peerConnections: pcs };
          });
        }
      }
    } catch (err) {
      set({
        state: 'idle',
        error: err instanceof Error ? err.message : 'Failed to join call',
      });
      throw err;
    }
  },

  acceptCall: async (callId) => {
    try {
      set({ state: 'connecting' });

      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: get().localMediaState.videoEnabled,
      });

      set({ localStream: stream });

      // Join call via API
      const { callSession, iceServers } = await api.post<{
        callSession: { id: string; participants?: Array<{ user: { id: string; displayName: string } }> };
        iceServers: IceServer[];
      }>(`/calls/${callId}/join`);

      set({
        iceServers: iceServers || DEFAULT_ICE_SERVERS,
        state: 'in_call',
      });

      // Join socket room
      const { socket } = get();
      if (socket) {
        socket.emit(SOCKET_EVENTS.CALL_ACCEPTED, { callId });
        socket.emit(SOCKET_EVENTS.CALL_JOIN, { callId });
      }
    } catch (err) {
      set({
        state: 'idle',
        error: err instanceof Error ? err.message : 'Failed to accept call',
      });
      throw err;
    }
  },

  declineCall: () => {
    const { callId, socket } = get();
    if (socket && callId) {
      socket.emit(SOCKET_EVENTS.CALL_DECLINED, { callId });
    }
    set({ ...initialState, socket: get().socket, currentUserId: get().currentUserId });
  },

  leaveCall: async () => {
    const { callId, localStream, localScreenStream, peerConnections, socket } = get();

    // Stop all tracks
    localStream?.getTracks().forEach((t) => t.stop());
    localScreenStream?.getTracks().forEach((t) => t.stop());

    // Close all peer connections
    peerConnections.forEach((pcData) => pcData.pc.close());

    // Notify via socket
    if (socket && callId) {
      socket.emit(SOCKET_EVENTS.CALL_LEAVE, { callId });
    }

    // Leave via API
    if (callId) {
      try {
        await api.post(`/calls/${callId}/leave`);
      } catch (err) {
        console.error('Error leaving call:', err);
      }
    }

    set({ ...initialState, socket: get().socket, currentUserId: get().currentUserId });
  },

  endCall: async () => {
    const { callId, localStream, localScreenStream, peerConnections, socket } = get();

    // Stop all tracks
    localStream?.getTracks().forEach((t) => t.stop());
    localScreenStream?.getTracks().forEach((t) => t.stop());

    // Close all peer connections
    peerConnections.forEach((pcData) => pcData.pc.close());

    // Notify via socket
    if (socket && callId) {
      socket.emit(SOCKET_EVENTS.CALL_HANGUP, { callId });
    }

    // End via API
    if (callId) {
      try {
        await api.post(`/calls/${callId}/end`);
      } catch (err) {
        console.error('Error ending call:', err);
      }
    }

    set({ ...initialState, socket: get().socket, currentUserId: get().currentUserId });
  },

  toggleAudio: () => {
    const { localStream, localMediaState, socket, callId } = get();
    const newState = !localMediaState.audioEnabled;

    localStream?.getAudioTracks().forEach((t) => {
      t.enabled = newState;
    });

    const newMediaState = { ...localMediaState, audioEnabled: newState };
    set({ localMediaState: newMediaState });

    // Notify others
    if (socket && callId) {
      socket.emit(SOCKET_EVENTS.CALL_MEDIA_STATE, {
        callId,
        ...newMediaState,
      });
    }
  },

  toggleVideo: async () => {
    const { localStream, localMediaState, peerConnections, socket, callId } = get();
    const newState = !localMediaState.videoEnabled;

    if (newState) {
      // Add video track
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];

        if (localStream) {
          localStream.addTrack(videoTrack);

          // Add track to all peer connections
          peerConnections.forEach((pcData) => {
            pcData.pc.addTrack(videoTrack, localStream);
          });
        }
      } catch (err) {
        console.error('Failed to get video:', err);
        return;
      }
    } else {
      // Remove video track
      localStream?.getVideoTracks().forEach((t) => {
        t.stop();
        localStream.removeTrack(t);

        // Remove from peer connections
        peerConnections.forEach((pcData) => {
          const sender = pcData.pc.getSenders().find((s) => s.track === t);
          if (sender) {
            pcData.pc.removeTrack(sender);
          }
        });
      });
    }

    const newMediaState = { ...localMediaState, videoEnabled: newState };
    set({ localMediaState: newMediaState });

    // Notify others
    if (socket && callId) {
      socket.emit(SOCKET_EVENTS.CALL_MEDIA_STATE, {
        callId,
        ...newMediaState,
      });
    }
  },

  startScreenShare: async () => {
    try {
      // Use Electron's display picker
      const sources = await window.electronAPI.getDisplaySources();

      if (sources.length === 0) {
        throw new Error('No display sources available');
      }

      // Use first screen for now (picker shown in UI)
      const screenStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sources[0].id,
          },
        } as MediaTrackConstraints,
      });

      const { peerConnections, socket, callId, localMediaState } = get();

      // Add screen tracks to all peer connections
      screenStream.getTracks().forEach((track) => {
        peerConnections.forEach((pcData) => {
          pcData.pc.addTrack(track, screenStream);
        });

        track.onended = () => {
          get().stopScreenShare();
        };
      });

      const newMediaState = { ...localMediaState, screenShareEnabled: true };
      set({ localScreenStream: screenStream, localMediaState: newMediaState });

      // Notify others
      if (socket && callId) {
        socket.emit(SOCKET_EVENTS.CALL_SCREENSHARE_START, { callId });
        socket.emit(SOCKET_EVENTS.CALL_MEDIA_STATE, { callId, ...newMediaState });
      }
    } catch (err) {
      console.error('Failed to start screen share:', err);
      throw err;
    }
  },

  stopScreenShare: () => {
    const { localScreenStream, peerConnections, socket, callId, localMediaState } = get();

    localScreenStream?.getTracks().forEach((t) => {
      t.stop();
      peerConnections.forEach((pcData) => {
        const sender = pcData.pc.getSenders().find((s) => s.track === t);
        if (sender) {
          pcData.pc.removeTrack(sender);
        }
      });
    });

    const newMediaState = { ...localMediaState, screenShareEnabled: false };
    set({ localScreenStream: null, localMediaState: newMediaState });

    // Notify others
    if (socket && callId) {
      socket.emit(SOCKET_EVENTS.CALL_SCREENSHARE_STOP, { callId });
      socket.emit(SOCKET_EVENTS.CALL_MEDIA_STATE, { callId, ...newMediaState });
    }
  },

  setIncomingCall: (data) => {
    set({
      state: 'ringing_incoming',
      callId: data.callId,
      channelId: data.channelId || null,
      dmThreadId: data.dmThreadId || null,
      caller: {
        userId: data.fromUserId,
        displayName: data.fromDisplayName,
      },
    });
  },

  handleParticipantJoined: async (data) => {
    const { currentUserId } = get();
    if (data.userId === currentUserId) return;

    // Add participant
    set((state) => {
      const participants = new Map(state.participants);
      participants.set(data.userId, {
        userId: data.userId,
        displayName: data.displayName,
        mediaState: { audioEnabled: true, videoEnabled: false, screenShareEnabled: false },
        stream: null,
        screenStream: null,
        isSpeaking: false,
        connectionState: 'new',
      });
      return { participants };
    });

    // Create peer connection and send offer
    const pcData = (get() as any).createPeerConnection(data.userId);
    set((state) => {
      const pcs = new Map(state.peerConnections);
      pcs.set(data.userId, pcData);
      return { peerConnections: pcs };
    });
  },

  handleParticipantLeft: (data) => {
    const { peerConnections } = get();
    const pcData = peerConnections.get(data.userId);
    if (pcData) {
      pcData.pc.close();
    }

    set((state) => {
      const participants = new Map(state.participants);
      participants.delete(data.userId);
      const pcs = new Map(state.peerConnections);
      pcs.delete(data.userId);
      return { participants, peerConnections: pcs };
    });
  },

  handleOffer: async (data) => {
    const { peerConnections, currentUserId, socket, callId } = get();
    let pcData = peerConnections.get(data.fromUserId);

    // Create peer connection if doesn't exist
    if (!pcData) {
      pcData = (get() as any).createPeerConnection(data.fromUserId);
      set((state) => {
        const pcs = new Map(state.peerConnections);
        pcs.set(data.fromUserId, pcData!);
        return { peerConnections: pcs };
      });

      // Also add as participant if not exists
      set((state) => {
        if (!state.participants.has(data.fromUserId)) {
          const participants = new Map(state.participants);
          participants.set(data.fromUserId, {
            userId: data.fromUserId,
            displayName: 'Participant',
            mediaState: { audioEnabled: true, videoEnabled: false, screenShareEnabled: false },
            stream: null,
            screenStream: null,
            isSpeaking: false,
            connectionState: 'new',
          });
          return { participants };
        }
        return state;
      });
    }

    const { pc, makingOffer, ignoreOffer } = pcData;

    // Perfect negotiation pattern
    const offerCollision = makingOffer || pc.signalingState !== 'stable';
    const polite = currentUserId! > data.fromUserId; // Higher ID is polite

    pcData.ignoreOffer = !polite && offerCollision;
    if (pcData.ignoreOffer) {
      return;
    }

    try {
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (socket && pc.localDescription) {
        socket.emit(SOCKET_EVENTS.CALL_ANSWER, {
          callId,
          toUserId: data.fromUserId,
          sdp: pc.localDescription,
        });
      }
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  },

  handleAnswer: async (data) => {
    const { peerConnections } = get();
    const pcData = peerConnections.get(data.fromUserId);
    if (!pcData) return;

    try {
      await pcData.pc.setRemoteDescription(data.sdp);
    } catch (err) {
      console.error('Error handling answer:', err);
    }
  },

  handleIceCandidate: async (data) => {
    const { peerConnections } = get();
    const pcData = peerConnections.get(data.fromUserId);
    if (!pcData) return;

    try {
      await pcData.pc.addIceCandidate(data.candidate);
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  },

  handleMediaStateUpdate: (data) => {
    set((state) => {
      const participant = state.participants.get(data.userId);
      if (!participant) return state;

      const participants = new Map(state.participants);
      participants.set(data.userId, {
        ...participant,
        mediaState: {
          audioEnabled: data.audioEnabled,
          videoEnabled: data.videoEnabled,
          screenShareEnabled: data.screenShareEnabled,
        },
      });
      return { participants };
    });
  },

  reset: () => {
    const { localStream, localScreenStream, peerConnections, socket, currentUserId } = get();

    localStream?.getTracks().forEach((t) => t.stop());
    localScreenStream?.getTracks().forEach((t) => t.stop());
    peerConnections.forEach((pcData) => pcData.pc.close());

    set({ ...initialState, socket, currentUserId });
  },
}));
