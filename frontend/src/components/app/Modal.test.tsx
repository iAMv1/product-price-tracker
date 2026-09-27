import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Opener
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} labelledBy="test-title">
          <h2 id="test-title">Dialog</h2>
          <button type="button">First</button>
          <button type="button">Second</button>
        </Modal>
      )}
    </>
  );
}

describe("Modal", () => {
  it("moves focus inside on open and traps Tab with wraparound", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Opener" }));
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    const first = screen.getByRole("button", { name: "First" });
    const second = screen.getByRole("button", { name: "Second" });
    await user.tab();
    expect(document.activeElement).toBe(first);
    await user.tab();
    expect(document.activeElement).toBe(second);
    // Wraps past the end instead of escaping to the page.
    await user.tab();
    expect(document.activeElement).toBe(first);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(second);
    // Leave no open modal behind: the next test starts from a clean tree.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape and restores focus to the opener", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Opener" });
    await user.click(opener);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
