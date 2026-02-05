import type { ClientCallState, CallMediaState } from '@teamchat/shared';

export interface CallStateData {
  state: ClientCallState;
  callId: string | null;
  channelId?: string;
  dmThreadId?: string;
  participants: Map<string, ParticipantData>;
  localMediaState: CallMediaState;
  error: string | null;
}

export interface ParticipantData {
  userId: string;
  displayName: string;
  mediaState: CallMediaState;
  stream: MediaStream | null;
  screenStream: MediaStream | null;
  isSpeaking: boolean;
}

type StateTransition = {
  from: ClientCallState[];
  to: ClientCallState;
};

// Valid state transitions
const VALID_TRANSITIONS: StateTransition[] = [
  // Starting a call
  { from: ['idle'], to: 'ringing_outgoing' },
  { from: ['idle'], to: 'ringing_incoming' },

  // Connecting
  { from: ['ringing_outgoing', 'ringing_incoming'], to: 'connecting' },
  { from: ['ringing_incoming'], to: 'idle' }, // Declined

  // In call
  { from: ['connecting'], to: 'in_call' },
  { from: ['reconnecting'], to: 'in_call' },

  // Reconnecting
  { from: ['in_call'], to: 'reconnecting' },

  // Ending
  { from: ['ringing_outgoing', 'ringing_incoming', 'connecting', 'in_call', 'reconnecting'], to: 'ended' },

  // Reset
  { from: ['ended'], to: 'idle' },
];

export class CallStateMachine {
  private data: CallStateData;
  private listeners: Set<(data: CallStateData) => void> = new Set();

  constructor() {
    this.data = this.getInitialState();
  }

  private getInitialState(): CallStateData {
    return {
      state: 'idle',
      callId: null,
      participants: new Map(),
      localMediaState: {
        audioEnabled: true,
        videoEnabled: false,
        screenShareEnabled: false,
      },
      error: null,
    };
  }

  getState(): CallStateData {
    return { ...this.data, participants: new Map(this.data.participants) };
  }

  subscribe(listener: (data: CallStateData) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  private canTransition(to: ClientCallState): boolean {
    return VALID_TRANSITIONS.some(
      (t) => t.from.includes(this.data.state) && t.to === to
    );
  }

  transition(to: ClientCallState): boolean {
    if (!this.canTransition(to)) {
      console.warn(
        `[CallStateMachine] Invalid transition: ${this.data.state} -> ${to}`
      );
      return false;
    }

    this.data.state = to;
    this.notify();
    return true;
  }

  // Actions

  startOutgoingCall(callId: string, scope: { channelId?: string; dmThreadId?: string }): boolean {
    if (!this.transition('ringing_outgoing')) return false;
    this.data.callId = callId;
    this.data.channelId = scope.channelId;
    this.data.dmThreadId = scope.dmThreadId;
    this.data.error = null;
    this.notify();
    return true;
  }

  receiveIncomingCall(callId: string, scope: { channelId?: string; dmThreadId?: string }): boolean {
    if (!this.transition('ringing_incoming')) return false;
    this.data.callId = callId;
    this.data.channelId = scope.channelId;
    this.data.dmThreadId = scope.dmThreadId;
    this.data.error = null;
    this.notify();
    return true;
  }

  acceptCall(): boolean {
    return this.transition('connecting');
  }

  declineCall(): boolean {
    if (!this.transition('idle')) return false;
    this.reset();
    return true;
  }

  connected(): boolean {
    return this.transition('in_call');
  }

  reconnecting(): boolean {
    return this.transition('reconnecting');
  }

  reconnected(): boolean {
    return this.transition('in_call');
  }

  endCall(): boolean {
    if (!this.transition('ended')) return false;
    // Clear participants but keep callId for potential logging
    this.data.participants.clear();
    this.notify();
    return true;
  }

  reset(): void {
    this.data = this.getInitialState();
    this.notify();
  }

  setError(error: string): void {
    this.data.error = error;
    this.notify();
  }

  // Participant management

  addParticipant(participant: Omit<ParticipantData, 'stream' | 'screenStream' | 'isSpeaking'>): void {
    this.data.participants.set(participant.userId, {
      ...participant,
      stream: null,
      screenStream: null,
      isSpeaking: false,
    });
    this.notify();
  }

  removeParticipant(userId: string): void {
    this.data.participants.delete(userId);
    this.notify();
  }

  updateParticipantStream(userId: string, stream: MediaStream, type: 'main' | 'screen'): void {
    const participant = this.data.participants.get(userId);
    if (!participant) return;

    if (type === 'main') {
      participant.stream = stream;
    } else {
      participant.screenStream = stream;
    }
    this.notify();
  }

  updateParticipantMediaState(userId: string, mediaState: CallMediaState): void {
    const participant = this.data.participants.get(userId);
    if (!participant) return;

    participant.mediaState = mediaState;
    this.notify();
  }

  updateParticipantSpeaking(userId: string, isSpeaking: boolean): void {
    const participant = this.data.participants.get(userId);
    if (!participant) return;

    participant.isSpeaking = isSpeaking;
    this.notify();
  }

  // Local media state

  setLocalMediaState(state: Partial<CallMediaState>): void {
    this.data.localMediaState = { ...this.data.localMediaState, ...state };
    this.notify();
  }

  toggleAudio(): void {
    this.data.localMediaState.audioEnabled = !this.data.localMediaState.audioEnabled;
    this.notify();
  }

  toggleVideo(): void {
    this.data.localMediaState.videoEnabled = !this.data.localMediaState.videoEnabled;
    this.notify();
  }

  toggleScreenShare(): void {
    this.data.localMediaState.screenShareEnabled = !this.data.localMediaState.screenShareEnabled;
    this.notify();
  }
}
