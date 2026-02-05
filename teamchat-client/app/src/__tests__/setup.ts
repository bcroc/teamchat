import { vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

vi.stubGlobal('localStorage', localStorageMock);

// Mock fetch
vi.stubGlobal('fetch', vi.fn());

// Mock MediaStream
class MockMediaStream {
  id = 'mock-stream-id';
  active = true;

  getTracks() {
    return [];
  }

  getAudioTracks() {
    return [];
  }

  getVideoTracks() {
    return [];
  }

  addTrack() {}
  removeTrack() {}
}

vi.stubGlobal('MediaStream', MockMediaStream);

// Mock RTCPeerConnection
class MockRTCPeerConnection {
  localDescription = null;
  remoteDescription = null;
  connectionState = 'new';
  iceConnectionState = 'new';

  createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' });
  createAnswer = vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  addIceCandidate = vi.fn().mockResolvedValue(undefined);
  addTrack = vi.fn();
  removeTrack = vi.fn();
  getSenders = vi.fn().mockReturnValue([]);
  getStats = vi.fn().mockResolvedValue(new Map());
  close = vi.fn();
  restartIce = vi.fn();

  onicecandidate = null;
  ontrack = null;
  onconnectionstatechange = null;
  onnegotiationneeded = null;
  oniceconnectionstatechange = null;
}

vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection);
vi.stubGlobal('RTCSessionDescription', class {});
vi.stubGlobal('RTCIceCandidate', class {});

// Mock navigator.mediaDevices
vi.stubGlobal('navigator', {
  mediaDevices: {
    getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()),
    getDisplayMedia: vi.fn().mockResolvedValue(new MockMediaStream()),
  },
});
