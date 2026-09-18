import { useEffect, useRef } from "react";
import { formatMessageTime } from "../model/messages.js";
export default function ChatPanel({ messages, value, onChange, onSubmit }) {
  const messagesRef = useRef(null);
  useEffect(() => {
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  return (
    <section aria-label="Чат" className="chat-panel">
      <h2>Чат</h2>
      <ul ref={messagesRef} className="messages">
        {messages.map((message) => (
          <li key={message.id}>
            <small>{formatMessageTime(message.createdAt)}</small>{" "}
            {message.type === "system" ? (
              <em>
                {message.event === "participant-joined"
                  ? `${message.participant.displayName} вошёл(ла) в комнату`
                  : `${message.participant.displayName} вышел(ла) из комнаты`}
              </em>
            ) : (
              <>
                <strong>{message.author.displayName}</strong>: {message.text}
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="chat-form" onSubmit={onSubmit}>
        <input
          aria-label="Сообщение"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Сообщение"
        />
        <button type="submit">Отправить</button>
      </form>
    </section>
  );
}
