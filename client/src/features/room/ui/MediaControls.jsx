export default function MediaControls({
  audioEnabled,
  hasAudio,
  onToggleAudio,
}) {
  return (
    <section aria-label="Управление звонком">
      <button type="button" disabled={!hasAudio} onClick={onToggleAudio}>
        {hasAudio
          ? audioEnabled
            ? "Выключить микрофон"
            : "Включить микрофон"
          : "Микрофон недоступен"}
      </button>
    </section>
  );
}
