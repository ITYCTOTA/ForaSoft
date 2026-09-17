export default function ParticipantList({ participants }) {
  if (participants.length === 0) return null;

  return (
    <section aria-label="Участники" className="participant-panel">
      <h2>Участники</h2>
      <ul className="participant-list">
        {participants.map((participant) => (
          <li key={participant.id}>{participant.displayName}</li>
        ))}
      </ul>
    </section>
  );
}
