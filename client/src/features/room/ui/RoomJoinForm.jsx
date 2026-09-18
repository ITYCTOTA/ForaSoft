/* eslint-disable no-unused-vars */
import { ERROR_CODES } from "@video-chat-room/shared";
import NameField from "../../../shared/ui/NameField.jsx";
import InviteLink from "./InviteLink.jsx";

export default function RoomJoinForm({
  roomId,
  name,
  error,
  sessionPhase,
  connectionErrorCode,
  onNameChange,
  onJoin,
}) {
  return (
    <main className="app-shell card">
      <h1>Комната</h1>
      <InviteLink />
      <NameField value={name} onChange={onNameChange} error={error} />
      <button
        type="button"
        onClick={onJoin}
        disabled={sessionPhase === "joining"}
      >
        {sessionPhase === "joining"
          ? "Подключение..."
          : connectionErrorCode === ERROR_CODES.ROOM_FULL
            ? "Повторить вход"
            : "Войти"}
      </button>
      <small>Идентификатор комнаты: {roomId}</small>
    </main>
  );
}
