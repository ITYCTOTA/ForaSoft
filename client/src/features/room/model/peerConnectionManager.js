const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export class PeerConnectionManager {
  constructor({
    RTCPeerConnectionCtor = globalThis.RTCPeerConnection,
    MediaStreamCtor = globalThis.MediaStream,
    iceServers = DEFAULT_ICE_SERVERS,
    maxPeers = 3,
    onRemoteStream = () => {},
    onPeerState = () => {},
  } = {}) {
    this.RTCPeerConnectionCtor = RTCPeerConnectionCtor;
    this.MediaStreamCtor = MediaStreamCtor;
    this.iceServers = iceServers;
    this.maxPeers = maxPeers;
    this.onRemoteStream = onRemoteStream;
    this.onPeerState = onPeerState;
    this.peers = new Map();
  }

  ensurePeer(participantId) {
    if (this.peers.has(participantId)) return this.peers.get(participantId);
    if (this.peers.size >= this.maxPeers)
      throw new Error("Peer capacity exceeded");
    if (!this.RTCPeerConnectionCtor) throw new Error("WebRTC is unavailable");
    const connection = new this.RTCPeerConnectionCtor({
      iceServers: this.iceServers,
    });
    const audio = connection.addTransceiver("audio", { direction: "sendrecv" });
    const video = connection.addTransceiver("video", { direction: "sendrecv" });
    const peer = {
      participantId,
      connection,
      audioSender: audio.sender,
      videoSender: video.sender,
      remoteStream: null,
    };
    connection.ontrack = (event) => {
      const stream =
        event.streams?.[0] ?? this.#appendRemoteTrack(peer, event.track);
      peer.remoteStream = stream;
      this.onRemoteStream(participantId, stream);
    };
    connection.onconnectionstatechange = () =>
      this.onPeerState(participantId, connection.connectionState);
    this.peers.set(participantId, peer);
    return peer;
  }

  async setLocalStream(stream) {
    const audioTrack = stream?.getAudioTracks?.()[0] ?? null;
    const videoTrack = stream?.getVideoTracks?.()[0] ?? null;
    await Promise.all(
      [...this.peers.values()].flatMap((peer) => [
        peer.audioSender.replaceTrack(audioTrack),
        peer.videoSender.replaceTrack(videoTrack),
      ]),
    );
  }

  removePeer(participantId) {
    const peer = this.peers.get(participantId);
    if (!peer) return false;
    peer.connection.ontrack = null;
    peer.connection.onconnectionstatechange = null;
    peer.connection.close();
    this.peers.delete(participantId);
    return true;
  }

  closeAll() {
    [...this.peers.keys()].forEach((participantId) =>
      this.removePeer(participantId),
    );
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
