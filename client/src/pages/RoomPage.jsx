/* eslint-disable no-unused-vars */
import { useRoomCall } from "../features/room/model/useRoomCall.js";
import RoomJoinForm from "../features/room/ui/RoomJoinForm.jsx";
import RoomWorkspace from "../features/room/ui/RoomWorkspace.jsx";

export default function RoomPage({ roomId, initialName = "", onLeave }) {
  const room = useRoomCall({ roomId, initialName, onLeave });

  return room.isInRoom ? (
    <RoomWorkspace
      roomId={roomId}
      participants={room.participants}
      selfId={room.selfId}
      localStream={room.localStream}
      remoteStreams={room.remoteStreams}
      mediaState={room.mediaState}
      hasAudio={room.hasAudio}
      peerFailures={room.peerFailures}
      error={room.error}
      messageText={room.messageText}
      messages={room.messages}
      sessionPhase={room.sessionPhase}
      onLeave={room.leaveRoom}
      onMessageChange={room.setMessageText}
      onMessageSubmit={room.sendMessage}
      onToggleAudio={room.toggleMicrophone}
      onToggleVideo={room.toggleCamera}
    />
  ) : (
    <RoomJoinForm
      roomId={roomId}
      name={room.name}
      error={room.formError}
      sessionPhase={room.sessionPhase}
      connectionErrorCode={room.connectionErrorCode}
      onNameChange={room.setName}
      onJoin={room.join}
    />
  );
}
