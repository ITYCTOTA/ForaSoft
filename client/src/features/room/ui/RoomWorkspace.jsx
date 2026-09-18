/* eslint-disable no-unused-vars */
import ParticipantList from "../../../entities/participant/ui/ParticipantList.jsx";
import ChatPanel from "./ChatPanel.jsx";
import InviteLink from "./InviteLink.jsx";
import MediaControls from "./MediaControls.jsx";
import VideoGrid from "./VideoGrid.jsx";

export default function RoomWorkspace({
  roomId,
  participants,
  selfId,
  localStream,
  remoteStreams,
  mediaState,
  hasAudio,
  peerFailures,
  error,
  messageText,
  sessionPhase,
  messages,
  onLeave,
  onMessageChange,
  onMessageSubmit,
  onToggleAudio,
  onToggleVideo,
}) {
  return (
    <main className="room-page">
      <header className="room-header">
        <h1>Комната</h1>
        <InviteLink />
        <div className="room-session-actions">
          <span role="status">Вы вошли в комнату.</span>
          <button
            type="button"
            onClick={onLeave}
            disabled={sessionPhase === "leaving"}
          >
            {sessionPhase === "leaving" ? "Выход..." : "Выйти"}
          </button>
        </div>
      </header>
      <div className="room-workspace">
        <section className="conference-stage" aria-label="Видеозвонок">
          <VideoGrid
            participants={participants}
            selfId={selfId}
            localStream={localStream}
            remoteStreams={remoteStreams}
          />
          <MediaControls
            audioEnabled={mediaState.audioEnabled}
            hasAudio={hasAudio}
            videoEnabled={mediaState.videoEnabled}
            onToggleAudio={onToggleAudio}
            onToggleVideo={onToggleVideo}
          />
          {error && <p role="alert">{error}</p>}
          {Object.entries(peerFailures).map(([participantId, message]) => (
            <p key={participantId} role="alert" className="peer-failure">
              {participants.find(
                (participant) => participant.id === participantId,
              )?.displayName ?? "Участник"}
              : {message}
            </p>
          ))}
        </section>
        <aside className="room-sidebar">
          <ParticipantList participants={participants} />
          <ChatPanel
            messages={messages}
            value={messageText}
            onChange={onMessageChange}
            onSubmit={onMessageSubmit}
          />
        </aside>
      </div>
      <small className="room-id">Идентификатор комнаты: {roomId}</small>
    </main>
  );
}
