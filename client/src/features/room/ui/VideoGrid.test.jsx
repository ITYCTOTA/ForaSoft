import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import VideoGrid, { gridClassName } from "./VideoGrid.jsx";

const participants = [
  { id: "self", displayName: "Анна", audioEnabled: true },
  { id: "remote", displayName: "Борис", audioEnabled: false },
];

describe("VideoGrid", () => {
  it("maps one to four participants to stable grid classes", () => {
    expect([1, 2, 3, 4, 8].map(gridClassName)).toEqual([
      "video-grid video-grid--1",
      "video-grid video-grid--2",
      "video-grid video-grid--3",
      "video-grid video-grid--4",
      "video-grid video-grid--4",
    ]);
  });
  it("shows a self label, placeholders and mute state without streams", () => {
    render(
      createElement(VideoGrid, {
        participants,
        selfId: "self",
        localStream: null,
        remoteStreams: {},
      }),
    );
    expect(screen.getByText("Анна (вы)")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Нет видео/)).toHaveLength(2);
    expect(screen.getByLabelText("Микрофон выключен")).toBeInTheDocument();
  });
});
