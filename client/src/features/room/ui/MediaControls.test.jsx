import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MediaControls from "./MediaControls.jsx";

describe("MediaControls", () => {
  it("does not show a false enabled state without microphone", () => {
    render(createElement(MediaControls, { audioEnabled: true, hasAudio: false, videoEnabled: false, onToggleAudio: vi.fn(), onToggleVideo: vi.fn() }));
    expect(screen.getByRole("button", { name: "Микрофон недоступен" })).toBeDisabled();
  });
  it("toggles a real microphone", () => {
    const toggle = vi.fn(); render(createElement(MediaControls, { audioEnabled: true, hasAudio: true, videoEnabled: true, onToggleAudio: toggle, onToggleVideo: vi.fn() }));
    fireEvent.click(screen.getByRole("button", { name: "Выключить микрофон" })); expect(toggle).toHaveBeenCalledOnce();
  });
  it("toggles camera", () => {
    const toggle = vi.fn(); render(createElement(MediaControls, { audioEnabled: false, hasAudio: false, videoEnabled: true, onToggleAudio: vi.fn(), onToggleVideo: toggle }));
    fireEvent.click(screen.getByRole("button", { name: "Выключить камеру" })); expect(toggle).toHaveBeenCalledOnce();
  });
});
