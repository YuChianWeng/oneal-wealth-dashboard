import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RangeSelector,
  type RangeKey,
} from "@/components/range/range-selector";

const LABELS: RangeKey[] = ["1M", "3M", "YTD", "1Y", "All"];

describe("RangeSelector", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all 5 pill buttons", () => {
    render(<RangeSelector value="3M" onChange={vi.fn()} />);
    for (const label of LABELS) {
      expect(screen.getByRole("radio", { name: label })).toBeDefined();
    }
  });

  it("marks the active range as checked", () => {
    render(<RangeSelector value="YTD" onChange={vi.fn()} />);
    const ytdBtn = screen.getByRole("radio", { name: "YTD" });
    expect(ytdBtn.getAttribute("aria-checked")).toBe("true");

    const oneMonthBtn = screen.getByRole("radio", { name: "1M" });
    expect(oneMonthBtn.getAttribute("aria-checked")).toBe("false");
  });

  it("calls onChange with the clicked range", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RangeSelector value="3M" onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "1Y" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("1Y");
  });

  it("calls onChange for each range option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RangeSelector value="3M" onChange={onChange} />);

    for (const range of LABELS) {
      await user.click(screen.getByRole("radio", { name: range }));
      expect(onChange).toHaveBeenCalledWith(range);
    }
  });

  it("has radiogroup role with accessible label", () => {
    render(<RangeSelector value="3M" onChange={vi.fn()} />);
    expect(screen.getByRole("radiogroup")).toBeDefined();
    expect(screen.getByRole("radiogroup").getAttribute("aria-label")).toBe(
      "時間範圍",
    );
  });
});
