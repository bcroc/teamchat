import type { IceServer, CallMediaState } from '@teamchat/shared';

export interface PeerConfig {
  iceServers: IceServer[];
  userId: string;
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onTrack: (stream: MediaStream, kind: 'audio' | 'video' | 'screen') => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onNegotiationNeeded?: () => void;
}

export class PeerConnection {
  private pc: RTCPeerConnection;
  private config: PeerConfig;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;

  constructor(config: PeerConfig) {
    this.config = config;
    this.pc = new RTCPeerConnection({
      iceServers: config.iceServers,
      iceCandidatePoolSize: 10,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.config.onIceCandidate(event.candidate.toJSON());
      }
    };

    this.pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;

      // Determine track type based on track id or label
      const track = event.track;
      let kind: 'audio' | 'video' | 'screen' = track.kind as 'audio' | 'video';

      // Check if this is a screen share track (common patterns)
      if (
        track.label.toLowerCase().includes('screen') ||
        track.id.toLowerCase().includes('screen')
      ) {
        kind = 'screen';
      }

      this.config.onTrack(stream, kind);
    };

    this.pc.onconnectionstatechange = () => {
      this.config.onConnectionStateChange(this.pc.connectionState);
    };

    this.pc.onnegotiationneeded = () => {
      this.config.onNegotiationNeeded?.();
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log(`[PeerConnection] ICE state: ${this.pc.iceConnectionState}`);
      if (this.pc.iceConnectionState === 'failed') {
        this.pc.restartIce();
      }
    };
  }

  async setLocalStream(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    stream.getTracks().forEach((track) => {
      this.pc.addTrack(track, stream);
    });
  }

  async setScreenStream(stream: MediaStream): Promise<void> {
    this.screenStream = stream;
    stream.getTracks().forEach((track) => {
      // Mark as screen share
      const sender = this.pc.addTrack(track, stream);
      // Handle screen share ended
      track.onended = () => {
        this.pc.removeTrack(sender);
        this.screenStream = null;
      };
    });
  }

  async stopScreenShare(): Promise<void> {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => {
        track.stop();
        const sender = this.pc.getSenders().find((s) => s.track === track);
        if (sender) {
          this.pc.removeTrack(sender);
        }
      });
      this.screenStream = null;
    }
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescriptionSet = true;

    // Add any pending ICE candidates
    for (const candidate of this.pendingCandidates) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    this.pendingCandidates = [];
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteDescriptionSet) {
      this.pendingCandidates.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  updateMediaState(state: CallMediaState): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = state.audioEnabled;
      });
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = state.videoEnabled;
      });
    }
  }

  getConnectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  getStats(): Promise<RTCStatsReport> {
    return this.pc.getStats();
  }

  close(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }
    this.pc.close();
  }
}

// Helper to get default ICE servers from environment or fallback to public STUN
export function getDefaultIceServers(): IceServer[] {
  const stunUrls = (typeof process !== 'undefined' && process.env?.STUN_URLS) ||
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';
  const turnUrls = typeof process !== 'undefined' && process.env?.TURN_URLS;
  const turnUsername = typeof process !== 'undefined' && process.env?.TURN_USERNAME;
  const turnCredential = typeof process !== 'undefined' && process.env?.TURN_CREDENTIAL;

  const servers: IceServer[] = [
    { urls: stunUrls.split(',') },
  ];

  if (turnUrls && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrls.split(','),
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return servers;
}
