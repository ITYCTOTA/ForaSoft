export class NegotiationController {
  constructor({ session, peerManager }) {
    this.session = session;
    this.peerManager = peerManager;
    this.selfId = null;
    this.queues = new Map();
    this.makingOffer = new Set();
    this.pendingCandidates = new Map();
  }
  start({ self, participants }) {
    this.selfId = self.id;
    participants
      .filter((participant) => participant.id !== self.id)
      .forEach((participant) => this.peerManager.ensurePeer(participant.id));
  }
  participantJoined(participant) {
    return this.#enqueue(participant.id, async () => {
      const peer = this.peerManager.ensurePeer(participant.id);
      this.makingOffer.add(participant.id);
      try {
        const offer = await peer.connection.createOffer();
        await peer.connection.setLocalDescription(offer);
        await this.session.sendSignal("signal:offer", {
          targetId: participant.id,
          sdp: peer.connection.localDescription,
        });
      } finally {
        this.makingOffer.delete(participant.id);
      }
    });
  }
  handleOffer({ fromId, sdp }) {
    return this.#enqueue(fromId, async () => {
      const peer = this.peerManager.ensurePeer(fromId);
      const collision =
        this.makingOffer.has(fromId) ||
        peer.connection.signalingState !== "stable";
      const polite = this.selfId.localeCompare(fromId) > 0;
      if (collision && !polite) return;
      if (collision && peer.connection.setLocalDescription)
        await peer.connection.setLocalDescription({ type: "rollback" });
      await peer.connection.setRemoteDescription(sdp);
      await this.#flushCandidates(fromId, peer);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      await this.session.sendSignal("signal:answer", {
        targetId: fromId,
        sdp: peer.connection.localDescription,
      });
    });
  }
  handleAnswer({ fromId, sdp }) {
    return this.#enqueue(fromId, async () => {
      const peer = this.peerManager.ensurePeer(fromId);
      await peer.connection.setRemoteDescription(sdp);
      await this.#flushCandidates(fromId, peer);
    });
  }
  handleIce({ fromId, candidate }) {
    return this.#enqueue(fromId, async () => {
      const peer = this.peerManager.ensurePeer(fromId);
      if (!peer.connection.remoteDescription) {
        const candidates = this.pendingCandidates.get(fromId) ?? [];
        candidates.push(candidate);
        this.pendingCandidates.set(fromId, candidates);
        return;
      }
      await peer.connection.addIceCandidate(candidate);
    });
  }
  removePeer(participantId) {
    this.pendingCandidates.delete(participantId);
    this.queues.delete(participantId);
    return this.peerManager.removePeer(participantId);
  }
  async #flushCandidates(participantId, peer) {
    const candidates = this.pendingCandidates.get(participantId) ?? [];
    this.pendingCandidates.delete(participantId);
    for (const candidate of candidates)
      await peer.connection.addIceCandidate(candidate);
  }
  #enqueue(participantId, operation) {
    const previous = this.queues.get(participantId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.queues.set(participantId, next);
    return next;
  }
}
