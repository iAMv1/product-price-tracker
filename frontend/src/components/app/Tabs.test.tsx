import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "./Tabs";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "History" },
  { id: "log", label: "Log" },
];

function Harness() {
  const [value, setValue] = useState("overview");
  return <Tabs label="Sections" tabs={TABS} value={value} onChange={setValue} />;
}

describe("Tabs", () => {
  it("moves with Arrow keys and activates on click", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const overview = screen.getByRole("tab", { name: "Overview" });
    const history = screen.getByRole("tab", { name: "History" });
    const log = screen.getByRole("tab", { name: "Log" });
    expect(overview).toHaveAttribute("aria-selected", "true");
    overview.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(history);
    expect(history).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(log);
    await user.click(overview);
    expect(overview).toHaveAttribute("aria-selected", "true");
  });
});
