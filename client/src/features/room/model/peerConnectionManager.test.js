import { describe, expect, it } from "vitest";
import { PeerConnectionManager } from "./peerConnectionManager.js";

class FakePeerConnection {
  constructor(config) {
    this.config = config;
    this.transceivers = [];
    this.connectionState = "new";
  }
  addTransceiver(trackOrKind) {
    const track = typeof trackOrKind === "string" ? null : trackOrKind;
    const kind = track?.kind ?? trackOrKind;
    const sender = {
      kind,
      track,
      replaceTrack: async (track) => {
        sender.track = track;
      },
    };
    const transceiver = { kind, sender, receiver: { track: { kind } } };
    this.transceivers.push(transceiver);
    return transceiver;
  }
  getTransceivers() {
    return this.transceivers;
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
  it("attaches the latest local stream to peers created after media acquisition", async () => {
    const manager = new PeerConnectionManager({
      RTCPeerConnectionCtor: FakePeerConnection,
      MediaStreamCtor: FakeStream,
    });
    const stream = {
      getAudioTracks: () => [{ kind: "audio" }],
      getVideoTracks: () => [{ kind: "video" }],
    };

    await manager.setLocalStream(stream);
    const peer = manager.ensurePeer("late-peer");
    await peer.ready;

    expect(peer.audioSender.track).toEqual({ kind: "audio" });
    expect(peer.videoSender.track).toEqual({ kind: "video" });
  });
  it("adds local tracks while creating a peer for the initial SDP exchange", async () => {
    const manager = new PeerConnectionManager({
      RTCPeerConnectionCtor: FakePeerConnection,
      MediaStreamCtor: FakeStream,
    });
    const stream = {
      getAudioTracks: () => [{ kind: "audio" }],
      getVideoTracks: () => [{ kind: "video" }],
    };

    await manager.setLocalStream(stream);
    const peer = manager.ensurePeer("initial-peer");

    expect(peer.audioSender.track).toEqual({ kind: "audio" });
    expect(peer.videoSender.track).toEqual({ kind: "video" });
  });
  it("attaches local tracks to transceivers created by an incoming offer", async () => {
    const manager = new PeerConnectionManager({
      RTCPeerConnectionCtor: FakePeerConnection,
      MediaStreamCtor: FakeStream,
    });
    await manager.setLocalStream({
      getAudioTracks: () => [{ kind: "audio" }],
      getVideoTracks: () => [{ kind: "video" }],
    });
    const peer = manager.ensurePeer("answer-peer", { prepareOffer: false });
    peer.connection.addTransceiver("audio");
    peer.connection.addTransceiver("video");

    await manager.attachLocalMediaForAnswer(peer);

    expect(peer.audioSender.track).toEqual({ kind: "audio" });
    expect(peer.videoSender.track).toEqual({ kind: "video" });
    expect(peer.audioTransceiver.direction).toBe("sendrecv");
    expect(peer.videoTransceiver.direction).toBe("sendrecv");
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
