/* eslint-disable no-unused-vars */
import { useEffect, useReducer, useRef, useState } from "react";
import { UI_MESSAGES, validateDisplayName } from "@video-chat-room/shared";
import ChatPanel from "../features/room/ui/ChatPanel.jsx";
import InviteLink from "../features/room/ui/InviteLink.jsx";
import NameField from "../shared/ui/NameField.jsx";
import ParticipantList from "../entities/participant/ui/ParticipantList.jsx";
import {
  initialMessagesState,
  messagesList,
  messagesReducer,
} from "../features/room/model/messages.js";
import {
  initialParticipantsState,
  participantsList,
  participantsReducer,
} from "../entities/participant/model/participants.js";
import { RoomSession } from "../features/room/model/roomSession.js";
import { MediaController } from "../features/room/model/mediaController.js";
import { NegotiationController } from "../features/room/model/negotiationController.js";
import { PeerConnectionManager } from "../features/room/model/peerConnectionManager.js";
import VideoGrid from "../features/room/ui/VideoGrid.jsx";
import MediaControls from "../features/room/ui/MediaControls.jsx";

export default function RoomPage({ roomId, initialName = "" }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [sessionPhase, setSessionPhase] = useState("idle");
  const [connectionError, setConnectionError] = useState("");
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
    const leaveOnPageHide = () =>
      void sessionRef.current?.leave({ waitForAck: false });
    window.addEventListener("pagehide", leaveOnPageHide);
    return () => {
      window.removeEventListener("pagehide", leaveOnPageHide);
      void sessionRef.current?.leave({ waitForAck: false });
    };
  }, []);
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
    ) {
      setSessionPhase(state.status);
    }
    if (state.status === "disconnected" || state.status === "error")
      setConnectionError(state.error ?? "");
    if (state.status === "error") {
      mediaRef.current?.stop();
      peerManagerRef.current?.closeAll();
      setLocalStream(null);
      setRemoteStreams({});
      setMediaState({ audioEnabled: false, videoEnabled: false });
      sessionRef.current = null;
    }
    if (state.status === "idle" || state.status === "disconnected") {
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
          onIceCandidate: (participantId, candidate) => {
            void sessionRef.current?.sendSignal("signal:ice", {
              targetId: participantId,
              candidate,
            });
          },
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
  const join = async () => {
    if (sessionPhase === "joining") return;
    const result = validateDisplayName(name);
    if (!result.ok) return setError(result.message);
    setSessionPhase("joining");
    setConnectionError("");
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
    if (!mediaRef.current) return;
    const next = mediaRef.current.toggleAudio();
    await applyMediaState(next);
  };
  const toggleCamera = async () => {
    if (!mediaRef.current) return;
    const next = mediaState.videoEnabled
      ? mediaRef.current.disableVideo()
      : await mediaRef.current.enableVideo();
    await applyMediaState(next);
  };
  const leaveRoom = async () => {
    await sessionRef.current?.leave();
  };
  const visibleMessages = messagesList(messages);
  const isInRoom = sessionPhase === "joined" || sessionPhase === "leaving";

  if (isInRoom) {
    return (
      <main className="room-page">
        <header className="room-header">
          <h1>Комната</h1>
          <InviteLink />
          <div className="room-session-actions">
            <span role="status">Вы вошли в комнату.</span>
            <button
              type="button"
              onClick={leaveRoom}
              disabled={sessionPhase === "leaving"}
            >
              {sessionPhase === "leaving" ? "Выход..." : "Выйти"}
            </button>
          </div>
        </header>

        <div className="room-workspace">
          <section className="conference-stage" aria-label="Видеозвонок">
            <VideoGrid
              participants={participantsList(participants)}
              selfId={participants.selfId}
              localStream={localStream}
              remoteStreams={remoteStreams}
            />
            <MediaControls
              audioEnabled={mediaState.audioEnabled}
              hasAudio={mediaRef.current?.stream.getAudioTracks().length > 0}
              videoEnabled={mediaState.videoEnabled}
              onToggleAudio={toggleMicrophone}
              onToggleVideo={toggleCamera}
            />
            {Object.entries(peerFailures).map(([participantId, message]) => (
              <p key={participantId} role="alert" className="peer-failure">
                {participants.byId[participantId]?.displayName ?? "Участник"}:{" "}
                {message}
              </p>
            ))}
          </section>

          <aside className="room-sidebar">
            <ParticipantList participants={participantsList(participants)} />
            <ChatPanel
              messages={visibleMessages}
              value={messageText}
              onChange={setMessageText}
              onSubmit={sendMessage}
            />
          </aside>
        </div>

        <small className="room-id">Идентификатор комнаты: {roomId}</small>
      </main>
    );
  }

  return (
    <main className="app-shell card">
      <h1>Комната</h1>
      <InviteLink />
      <NameField
        value={name}
        onChange={(value) => {
          setName(value);
          setError("");
        }}
        error={error || connectionError}
      />
      <button
        type="button"
        onClick={join}
        disabled={sessionPhase === "joining"}
      >
        {sessionPhase === "joining" ? "Подключение..." : "Войти"}
      </button>
      <small>Идентификатор комнаты: {roomId}</small>
    </main>
  );
}
