/* eslint-disable no-unused-vars, react-refresh/only-export-components */
import { useEffect, useRef, useState } from "react";

export function gridClassName(count) {
  return `video-grid video-grid--${Math.min(Math.max(count, 1), 4)}`;
}

function VideoTile({ participant, stream, self }) {
  const videoRef = useRef(null);
  const [needsAudioGesture, setNeedsAudioGesture] = useState(false);
  const hasVideo = stream?.getVideoTracks?.().length > 0;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return undefined;
    video.srcObject = stream;
    const playback = video.play?.();
    playback?.catch(() => {
      if (!self) setNeedsAudioGesture(true);
    });
    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [self, stream]);

  const enableAudio = async () => {
    try {
      await videoRef.current?.play?.();
      setNeedsAudioGesture(false);
    } catch {
      setNeedsAudioGesture(true);
    }
  };

  return (
    <article className="video-tile">
      {stream && <video className={hasVideo ? "" : "audio-only"} ref={videoRef} autoPlay playsInline muted={self} />}
      {!hasVideo && (
        <div className="video-placeholder" aria-label={`Нет видео: ${participant.displayName}`}>
          {participant.displayName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <footer>
        <span>{self ? `${participant.displayName} (вы)` : participant.displayName}</span>
        {!participant.audioEnabled && <span aria-label="Микрофон выключен">Микрофон выключен</span>}
      </footer>
      {needsAudioGesture && <button type="button" onClick={enableAudio}>Включить звук</button>}
    </article>
  );
}

export default function VideoGrid({ participants, selfId, localStream, remoteStreams }) {
  if (participants.length === 0) return null;
  return (
    <section aria-label="Видеозвонок" className={gridClassName(participants.length)}>
      {participants.map((participant) => (
        <VideoTile
          key={participant.id}
          participant={participant}
          self={participant.id === selfId}
          stream={participant.id === selfId ? localStream : remoteStreams[participant.id]}
        />
      ))}
    </section>
  );
}
