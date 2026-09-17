import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ChatPanel from "./ChatPanel.jsx";

describe("ChatPanel", () => {
  it("renders participant names and messages as text, not HTML", () => {
    render(
      createElement(ChatPanel, {
        messages: [
          {
            id: "message-id",
            type: "user",
            author: { displayName: '<img src=x onerror="alert(1)" />' },
            text: "<script>alert(1)</script>",
            createdAt: "2026-01-01T12:00:00.000Z",
          },
        ],
        value: "",
        onChange: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );

    expect(screen.getByText('<img src=x onerror="alert(1)" />')).toBeInTheDocument();
    expect(document.querySelector("li")).toHaveTextContent(
      "<script>alert(1)</script>",
    );
    expect(document.querySelector("img, script")).toBeNull();
  });
});
