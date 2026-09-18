import { useEffect, useReducer, useRef, useState } from "react";
import { UI_MESSAGES, validateDisplayName } from "@video-chat-room/shared";
import {
  initialMessagesState,
  messagesList,
  messagesReducer,
} from "./messages.js";
import { MediaController } from "./mediaController.js";
import { NegotiationController } from "./negotiationController.js";
import { PeerConnectionManager } from "./peerConnectionManager.js";
import { RoomSession } from "./roomSession.js";
import {
  initialParticipantsState,
  participantsList,
  participantsReducer,
} from "../../../entities/participant/model/participants.js";

export function useRoomCall({ roomId, initialName = "", onLeave }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [sessionPhase, setSessionPhase] = useState("idle");
  const [connectionError, setConnectionError] = useState("");
  const [connectionErrorCode, setConnectionErrorCode] = useState("");
  const [messageText, setMessageText] = useState("");
  const [peerFailures, setPeerFailures] = useState({});
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [mediaState, setMediaState] = useState({
    audioEnabled: false,
    videoEnabled: false,
  });
  const [participants, dispatchParticipants] = useReducer(
    participantsReducer,
    initialParticipantsState,
  );
  const [messages, dispatchMessages] = useReducer(
    messagesReducer,
    initialMessagesState,
  );
  const sessionRef = useRef(null);
  const mediaRef = useRef(null);
  const peerManagerRef = useRef(null);
  const negotiationRef = useRef(null);

  useEffect(() => {
    const leave = () => void sessionRef.current?.leave({ waitForAck: false });
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, []);

  const applyMediaState = async (next) => {
    setMediaState(next);
    setLocalStream(next.stream);
    await peerManagerRef.current?.setLocalStream(next.stream);
    await sessionRef.current?.sendMediaState({
      audioEnabled: next.audioEnabled,
      videoEnabled: next.videoEnabled,
    });
    if (next.error) setError(next.error);
  };
  const disposeCallResources = () => {
    peerManagerRef.current?.closeAll();
    mediaRef.current?.stop();
    sessionRef.current = null;
    mediaRef.current = null;
    peerManagerRef.current = null;
    negotiationRef.current = null;
    setLocalStream(null);
    setRemoteStreams({});
    setMediaState({ audioEnabled: false, videoEnabled: false });
  };
  const handleState = (state) => {
    if (
      [
        "joining",
        "joined",
        "leaving",
        "idle",
        "disconnected",
        "error",
      ].includes(state.status)
    )
      setSessionPhase(state.status);
    if (state.status === "disconnected" || state.status === "error")
      setConnectionError(state.error ?? "");
    if (state.status === "error") {
      setConnectionErrorCode(state.code ?? "");
      disposeCallResources();
    }
    if (state.status === "disconnected") {
      disposeCallResources();
    }
    if (state.status === "idle") {
      setLocalStream(null);
      setRemoteStreams({});
      setMediaState({ audioEnabled: false, videoEnabled: false });
    }
    if (state.status === "joined") {
      dispatchParticipants({
        type: "snapshot",
        selfId: state.self.id,
        participants: state.participants,
      });
      dispatchMessages({ type: "snapshot", messages: state.messages });
      void sessionRef.current?.sendMediaState({
        audioEnabled:
          mediaRef.current?.stream
            .getAudioTracks()
            .some((track) => track.enabled) ?? false,
        videoEnabled:
          mediaRef.current?.stream
            .getVideoTracks()
            .some((track) => track.enabled) ?? false,
      });
      if (globalThis.RTCPeerConnection) {
        peerManagerRef.current = new PeerConnectionManager({
          onIceCandidate: (participantId, candidate) =>
            void sessionRef.current?.sendSignal("signal:ice", {
              targetId: participantId,
              candidate,
            }),
          onPeerState: (participantId, connectionState) => {
            if (connectionState === "failed")
              setPeerFailures((current) => ({
                ...current,
                [participantId]: UI_MESSAGES.MEDIA_PEER_FAILED,
              }));
            if (connectionState === "connected")
              setPeerFailures((current) => {
                const next = { ...current };
                delete next[participantId];
                return next;
              });
          },
          onRemoteStream: (participantId, stream) =>
            setRemoteStreams((current) => ({
              ...current,
              [participantId]: stream,
            })),
        });
        negotiationRef.current = new NegotiationController({
          session: sessionRef.current,
          peerManager: peerManagerRef.current,
        });
        void peerManagerRef.current.setLocalStream(mediaRef.current?.stream);
        negotiationRef.current.start(state);
      }
    }
    if (state.status === "participant-joined") {
      dispatchParticipants({ type: "joined", participant: state.participant });
      void negotiationRef.current?.participantJoined(state.participant);
    }
    if (state.status === "participant-left") {
      dispatchParticipants({
        type: "left",
        participantId: state.participantId,
      });
      negotiationRef.current?.removePeer(state.participantId);
    }
    if (state.status === "media-state")
      dispatchParticipants({ type: "media-state", ...state });
    if (state.status === "chat-message")
      dispatchMessages({ type: "add", message: state.message });
    if (state.status === "signal-offer")
      void negotiationRef.current?.handleOffer(state);
    if (state.status === "signal-answer")
      void negotiationRef.current?.handleAnswer(state);
    if (state.status === "signal-ice")
      void negotiationRef.current?.handleIce(state);
  };
  const join = async () => {
    if (sessionPhase === "joining") return;
    const result = validateDisplayName(name);
    if (!result.ok) return setError(result.message);
    if (!globalThis.RTCPeerConnection) {
      setConnectionError("");
      setConnectionErrorCode("");
      setError(UI_MESSAGES.WEBRTC_UNSUPPORTED);
      return;
    }
    setSessionPhase("joining");
    setConnectionError("");
    setConnectionErrorCode("");
    if (!mediaRef.current)
      mediaRef.current = new MediaController({
        onStateChange: (next) => void applyMediaState(next),
      });
    const media = await mediaRef.current.acquire();
    await applyMediaState(media);
    setError(media.error ?? "");
    if (!sessionRef.current) {
      sessionRef.current = new RoomSession({ onState: handleState });
      sessionRef.current.registerCleanup(() => {
        peerManagerRef.current?.closeAll();
        mediaRef.current?.stop();
      });
    }
    sessionRef.current.join({ roomId, displayName: result.value });
  };
  const sendMessage = async (event) => {
    event.preventDefault();
    if (!messageText.trim() || !sessionRef.current) return;
    const result = await sessionRef.current.sendChat(messageText);
    if (result?.ok) setMessageText("");
    else if (result?.message) setError(result.message);
  };
  const toggleMicrophone = async () => {
    if (mediaRef.current) await applyMediaState(mediaRef.current.toggleAudio());
  };
  const toggleCamera = async () => {
    if (!mediaRef.current) return;
    await applyMediaState(
      mediaState.videoEnabled
        ? mediaRef.current.disableVideo()
        : await mediaRef.current.enableVideo(),
    );
  };
  const leaveRoom = async () => {
    await sessionRef.current?.leave();
    onLeave?.();
  };
  return {
    connectionErrorCode,
    error,
    formError: error || connectionError,
    hasAudio: mediaRef.current?.stream.getAudioTracks().length > 0,
    isInRoom: sessionPhase === "joined" || sessionPhase === "leaving",
    localStream,
    mediaState,
    messageText,
    messages: messagesList(messages),
    name,
    participants: participantsList(participants),
    peerFailures,
    remoteStreams,
    selfId: participants.selfId,
    sessionPhase,
    join,
    leaveRoom,
    sendMessage,
    setMessageText,
    setName: (value) => {
      setName(value);
      setError("");
    },
    toggleCamera,
    toggleMicrophone,
  };
}
