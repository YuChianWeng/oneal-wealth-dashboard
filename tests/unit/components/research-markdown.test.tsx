import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResearchMarkdown } from "@/components/portfolio/research-markdown";

describe("ResearchMarkdown", () => {
  it("renders headings, tables, and inline bold text from research notes", () => {
    render(
      <ResearchMarkdown
        content={`### 主要風險

| 風險類型 | 風險等級 | 說明 |
|----------|----------|------|
| 景氣循環風險 | 高 | **營收** 隨庫存週期波動 |

### 財務風險細節

- **負債結構**：需持續追蹤`}
      />,
    );

    expect(screen.getByText("主要風險")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "風險類型" })).toBeTruthy();
    expect(screen.getByText("景氣循環風險")).toBeTruthy();
    expect(screen.getByText("營收").tagName).toBe("STRONG");
    expect(screen.getByText("負債結構").tagName).toBe("STRONG");
  });
});
