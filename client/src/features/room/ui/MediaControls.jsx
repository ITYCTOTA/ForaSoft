export default function MediaControls({
  audioEnabled,
  hasAudio,
  videoEnabled,
  onToggleAudio,
  onToggleVideo,
}) {
  return (
    <section aria-label="Управление звонком" className="media-controls">
      <button type="button" disabled={!hasAudio} onClick={onToggleAudio}>
        {hasAudio
          ? audioEnabled
            ? "Выключить микрофон"
            : "Включить микрофон"
          : "Микрофон недоступен"}
      </button>
      <button type="button" onClick={onToggleVideo}>
        {videoEnabled ? "Выключить камеру" : "Включить камеру"}
      </button>
    </section>
  );
}
