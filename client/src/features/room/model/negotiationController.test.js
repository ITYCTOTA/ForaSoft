import { describe, expect, it } from "vitest";
import { NegotiationController } from "./negotiationController.js";

class FakeConnection {
  constructor() {
    this.signalingState = "stable";
    this.localDescription = null;
    this.candidates = [];
  }
  async createOffer() {
    return { type: "offer", sdp: "offer" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "answer" };
  }
  async setLocalDescription(value) {
    this.localDescription = value;
    this.locals ??= [];
    this.locals.push(value);
  }
  async setRemoteDescription(value) {
    this.remoteDescription = value;
  }
  async addIceCandidate(value) {
    this.candidates.push(value);
  }
}
function setup() {
  const peers = new Map();
  const manager = {
    ensurePeer(id) {
      if (!peers.has(id)) peers.set(id, { connection: new FakeConnection() });
      return peers.get(id);
    },
    removePeer(id) {
      return peers.delete(id);
    },
  };
  const sent = [];
  const session = {
    sendSignal: async (event, payload) => sent.push({ event, payload }),
  };
  return {
    controller: new NegotiationController({ session, peerManager: manager }),
    peers,
    sent,
  };
}

describe("NegotiationController", () => {
  it("makes the initial offer only for an existing participant on joined event", async () => {
    const { controller, sent } = setup();
    controller.start({ self: { id: "a" }, participants: [{ id: "b" }] });
    expect(sent).toEqual([]);
    await controller.participantJoined({ id: "c" });
    expect(sent).toEqual([
      {
        event: "signal:offer",
        payload: { targetId: "c", sdp: { type: "offer", sdp: "offer" } },
      },
    ]);
  });
  it("answers an offer and serializes remote SDP", async () => {
    const { controller, peers, sent } = setup();
    controller.start({ self: { id: "b" }, participants: [] });
    await controller.handleOffer({
      fromId: "a",
      sdp: { type: "offer", sdp: "remote" },
    });
    expect(peers.get("a").connection.remoteDescription.sdp).toBe("remote");
    expect(sent[0].event).toBe("signal:answer");
  });
  it("waits for a new peer to receive local tracks before sending an offer", async () => {
    let finishPeerSetup;
    const peer = { connection: new FakeConnection() };
    peer.ready = new Promise((resolve) => {
      finishPeerSetup = resolve;
    });
    const sent = [];
    const controller = new NegotiationController({
      session: {
        sendSignal: async (event, payload) => sent.push({ event, payload }),
      },
      peerManager: {
        ensurePeer: () => peer,
        removePeer: () => true,
      },
    });
    controller.start({ self: { id: "a" }, participants: [] });

    const negotiation = controller.participantJoined({ id: "b" });
    expect(sent).toEqual([]);
    finishPeerSetup();
    await negotiation;

    expect(sent[0].event).toBe("signal:offer");
  });
  it("uses deterministic polite role to ignore an offer collision", async () => {
    const { controller, peers, sent } = setup();
    controller.start({ self: { id: "a" }, participants: [] });
    controller.makingOffer.add("b");
    await controller.handleOffer({
      fromId: "b",
      sdp: { type: "offer", sdp: "remote" },
    });
    expect(peers.get("b").connection.remoteDescription).toBeUndefined();
    expect(sent).toEqual([]);
  });
  it("buffers ICE before SDP and clears it when peer leaves", async () => {
    const { controller, peers } = setup();
    controller.start({ self: { id: "a" }, participants: [] });
    await controller.handleIce({
      fromId: "b",
      candidate: { candidate: "early" },
    });
    expect(peers.get("b").connection.candidates).toEqual([]);
    await controller.handleAnswer({
      fromId: "b",
      sdp: { type: "answer", sdp: "remote" },
    });
    expect(peers.get("b").connection.candidates).toEqual([
      { candidate: "early" },
    ]);
    await controller.handleIce({
      fromId: "c",
      candidate: { candidate: "drop" },
    });
    controller.removePeer("c");
    expect(controller.pendingCandidates.has("c")).toBe(false);
  });
});
