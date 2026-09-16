export class NegotiationController {
  constructor({ session, peerManager }) {
    this.session = session;
    this.peerManager = peerManager;
    this.selfId = null;
    this.queues = new Map();
    this.makingOffer = new Set();
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
    });
  }
  #enqueue(participantId, operation) {
    const previous = this.queues.get(participantId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.queues.set(participantId, next);
    return next;
  }
}
