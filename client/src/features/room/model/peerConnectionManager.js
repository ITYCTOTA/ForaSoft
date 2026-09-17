const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export class PeerConnectionManager {
  constructor({
    RTCPeerConnectionCtor = globalThis.RTCPeerConnection,
    MediaStreamCtor = globalThis.MediaStream,
    iceServers = DEFAULT_ICE_SERVERS,
    maxPeers = 3,
    onRemoteStream = () => {},
    onPeerState = () => {},
    onIceCandidate = () => {},
  } = {}) {
    this.RTCPeerConnectionCtor = RTCPeerConnectionCtor;
    this.MediaStreamCtor = MediaStreamCtor;
    this.iceServers = iceServers;
    this.maxPeers = maxPeers;
    this.onRemoteStream = onRemoteStream;
    this.onPeerState = onPeerState;
    this.onIceCandidate = onIceCandidate;
    this.peers = new Map();
    this.localStream = null;
  }

  ensurePeer(participantId, { prepareOffer = true } = {}) {
    if (this.peers.has(participantId)) return this.peers.get(participantId);
    if (this.peers.size >= this.maxPeers)
      throw new Error("Peer capacity exceeded");
    if (!this.RTCPeerConnectionCtor) throw new Error("WebRTC is unavailable");
    const connection = new this.RTCPeerConnectionCtor({
      iceServers: this.iceServers,
    });
    const peer = {
      participantId,
      connection,
      audioTransceiver: null,
      videoTransceiver: null,
      audioSender: null,
      videoSender: null,
      remoteStream: null,
      ready: null,
    };
    connection.ontrack = (event) => {
      const stream =
        event.streams?.[0] ?? this.#appendRemoteTrack(peer, event.track);
      peer.remoteStream = stream;
      this.onRemoteStream(participantId, stream);
    };
    connection.onconnectionstatechange = () =>
      this.onPeerState(participantId, connection.connectionState);
    connection.onicecandidate = (event) => {
      if (event.candidate) this.onIceCandidate(participantId, event.candidate);
    };
    this.peers.set(participantId, peer);
    peer.ready = prepareOffer
      ? this.#createOfferTransceivers(peer)
      : Promise.resolve();
    return peer;
  }

  async setLocalStream(stream) {
    this.localStream = stream;
    await Promise.all(
      [...this.peers.values()].map((peer) => {
        peer.ready = this.#replaceTracks(peer, stream);
        return peer.ready;
      }),
    );
  }

  async attachLocalMediaForAnswer(peer) {
    this.#adoptRemoteTransceivers(peer);
    await this.#replaceTracks(peer, this.localStream);
    this.#setSendReceiveDirections(peer);
  }

  removePeer(participantId) {
    const peer = this.peers.get(participantId);
    if (!peer) return false;
    peer.connection.ontrack = null;
    peer.connection.onconnectionstatechange = null;
    peer.connection.onicecandidate = null;
    peer.connection.close();
    this.peers.delete(participantId);
    return true;
  }

  closeAll() {
    [...this.peers.keys()].forEach((participantId) =>
      this.removePeer(participantId),
    );
  }

  async #replaceTracks(peer, stream) {
    const audioTrack = stream?.getAudioTracks?.()[0] ?? null;
    const videoTrack = stream?.getVideoTracks?.()[0] ?? null;
    await Promise.all(
      [
        peer.audioSender && peer.audioSender.replaceTrack(audioTrack),
        peer.videoSender && peer.videoSender.replaceTrack(videoTrack),
      ].filter(Boolean),
    );
  }

  async #createOfferTransceivers(peer) {
    const audioTrack = this.localStream?.getAudioTracks?.()[0] ?? null;
    const videoTrack = this.localStream?.getVideoTracks?.()[0] ?? null;
    peer.audioTransceiver = peer.connection.addTransceiver(audioTrack ?? "audio", {
      direction: "sendrecv",
      ...(audioTrack ? { streams: [this.localStream] } : {}),
    });
    peer.videoTransceiver = peer.connection.addTransceiver(videoTrack ?? "video", {
      direction: "sendrecv",
      ...(videoTrack ? { streams: [this.localStream] } : {}),
    });
    peer.audioSender = peer.audioTransceiver.sender;
    peer.videoSender = peer.videoTransceiver.sender;
    await this.#replaceTracks(peer, this.localStream);
  }

  #adoptRemoteTransceivers(peer) {
    const transceivers = peer.connection.getTransceivers?.() ?? [];
    peer.audioTransceiver ??= transceivers.find(
      (transceiver) => transceiver.receiver?.track?.kind === "audio",
    ) ?? null;
    peer.videoTransceiver ??= transceivers.find(
      (transceiver) => transceiver.receiver?.track?.kind === "video",
    ) ?? null;
    peer.audioSender ??= peer.audioTransceiver?.sender ?? null;
    peer.videoSender ??= peer.videoTransceiver?.sender ?? null;
  }

  #setSendReceiveDirections(peer) {
    if (peer.audioSender?.track) peer.audioTransceiver.direction = "sendrecv";
    if (peer.videoSender?.track) peer.videoTransceiver.direction = "sendrecv";
  }

  #appendRemoteTrack(peer, track) {
    if (!peer.remoteStream)
      peer.remoteStream = this.MediaStreamCtor
        ? new this.MediaStreamCtor()
        : {
            tracks: [],
            addTrack(item) {
              this.tracks.push(item);
            },
          };
    peer.remoteStream.addTrack(track);
    return peer.remoteStream;
  }
}

export { DEFAULT_ICE_SERVERS };
