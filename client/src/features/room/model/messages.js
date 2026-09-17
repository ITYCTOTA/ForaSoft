const MAX_MESSAGES = 500;
export const initialMessagesState = Object.freeze({ byId: {}, order: [] });
export function messagesReducer(state = initialMessagesState, action) {
  if (action.type === "snapshot") {
    const messages = Array.isArray(action.messages)
      ? action.messages.slice(-MAX_MESSAGES).filter((message) => message?.id)
      : [];
    return {
      byId: Object.fromEntries(
        messages.map((message) => [message.id, message]),
      ),
      order: messages.map((message) => message.id),
    };
  }
  if (
    action.type !== "add" ||
    !action.message?.id ||
    state.byId[action.message.id]
  )
    return state;
  const order = [...state.order, action.message.id];
  const byId = { ...state.byId, [action.message.id]: action.message };
  while (order.length > MAX_MESSAGES) delete byId[order.shift()];
  return { byId, order };
}
export function messagesList(state) {
  return state.order.map((id) => state.byId[id]).filter(Boolean);
}
export function formatMessageTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
