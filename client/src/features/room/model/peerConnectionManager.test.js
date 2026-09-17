import { describe, expect, it } from "vitest";
import { PeerConnectionManager } from "./peerConnectionManager.js";

class FakePeerConnection {
  constructor(config) {
    this.config = config;
    this.transceivers = [];
    this.connectionState = "new";
  }
  addTransceiver(kind) {
    const sender = {
      kind,
      replaceTrack: async (track) => {
        sender.track = track;
      },
    };
    this.transceivers.push({ kind, sender });
    return { sender };
  }
  close() {
    this.closed = true;
  }
  emitTrack(track, streams = []) {
    this.ontrack({ track, streams });
  }
  emitCandidate(candidate) {
    this.onicecandidate({ candidate });
  }
}
class FakeStream {
  constructor() {
    this.tracks = [];
  }
  addTrack(track) {
    this.tracks.push(track);
  }
}

describe("PeerConnectionManager", () => {
  it("creates one peer per UUID with STUN and empty media senders", () => {
    const manager = new PeerConnectionManager({
      RTCPeerConnectionCtor: FakePeerConnection,
      MediaStreamCtor: FakeStream,
    });
    const peer = manager.ensurePeer("remote-1");
    expect(manager.ensurePeer("remote-1")).toBe(peer);
    expect(peer.connection.config.iceServers).toEqual([
      { urls: "stun:stun.l.google.com:19302" },
    ]);
    expect(peer.connection.transceivers.map((item) => item.kind)).toEqual([
      "audio",
      "video",
    ]);
  });
  it("limits peers, emits remote streams and closes only the removed peer", () => {
    const remote = [];
    const manager = new PeerConnectionManager({
      RTCPeerConnectionCtor: FakePeerConnection,
      MediaStreamCtor: FakeStream,
      onRemoteStream: (...args) => remote.push(args),
    });
    const first = manager.ensurePeer("one");
    const second = manager.ensurePeer("two");
    const third = manager.ensurePeer("three");
    first.connection.emitTrack({ kind: "video" });
    expect(remote[0][0]).toBe("one");
    expect(remote[0][1].tracks).toHaveLength(1);
    expect(() => manager.ensurePeer("four")).toThrow("capacity");
    manager.removePeer("two");
    expect(second.connection.closed).toBe(true);
    expect(first.connection.closed).toBeUndefined();
    expect(third.connection.closed).toBeUndefined();
  });
  it("replaces tracks for existing peers and closes all", async () => {
    const manager = new PeerConnectionManager({
      RTCPeerConnectionCtor: FakePeerConnection,
      MediaStreamCtor: FakeStream,
    });
    const peer = manager.ensurePeer("one");
    await manager.setLocalStream({
      getAudioTracks: () => [{ kind: "audio" }],
      getVideoTracks: () => [{ kind: "video" }],
    });
    expect(peer.audioSender.track.kind).toBe("audio");
    expect(peer.videoSender.track.kind).toBe("video");
    manager.closeAll();
    expect(peer.connection.closed).toBe(true);
    expect(manager.peers.size).toBe(0);
  });
  it("reports a failed peer without affecting other connections", () => {
    const states = [];
    const manager = new PeerConnectionManager({
      RTCPeerConnectionCtor: FakePeerConnection,
      MediaStreamCtor: FakeStream,
      onPeerState: (...args) => states.push(args),
    });
    const first = manager.ensurePeer("one");
    const second = manager.ensurePeer("two");
    first.connection.connectionState = "failed";
    first.connection.onconnectionstatechange();
    expect(states).toEqual([["one", "failed"]]);
    expect(second.connection.closed).toBeUndefined();
  });
  it("forwards trickle ICE for its peer", () => {
    const candidates = [];
    const manager = new PeerConnectionManager({
      RTCPeerConnectionCtor: FakePeerConnection,
      MediaStreamCtor: FakeStream,
      onIceCandidate: (...args) => candidates.push(args),
    });
    const peer = manager.ensurePeer("one");
    peer.connection.emitCandidate({ candidate: "candidate" });
    expect(candidates).toEqual([["one", { candidate: "candidate" }]]);
  });
});
