export default function NameField({ value, onChange, error }) {
  return (
    <label className="field">
      Отображаемое имя
      <input
        aria-label="Отображаемое имя"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={60}
        autoComplete="off"
      />
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
