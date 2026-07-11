import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import {
  ThemeProvider,
  useTheme,
  type Theme,
} from "@/components/theme/theme-provider";

/** Test component — captures the current theme text in the DOM so we can assert it. */
function TestConsumer() {
  const { theme, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-text">{theme}</span>
      <button data-testid="toggle-btn" onClick={toggleTheme}>
        Toggle
      </button>
      <button data-testid="set-light-btn" onClick={() => setTheme("light")}>
        Set Light
      </button>
      <button data-testid="set-dark-btn" onClick={() => setTheme("dark")}>
        Set Dark
      </button>
    </div>
  );
}

function renderTheme(initialLocalStorage?: Theme) {
  if (initialLocalStorage) {
    localStorage.setItem("oneal-wealth-theme", initialLocalStorage);
  }
  return render(
    <ThemeProvider>
      <TestConsumer />
    </ThemeProvider>,
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute("data-theme", "dark");
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("defaults to dark theme", () => {
    renderTheme();
    expect(screen.getByTestId("theme-text").textContent).toBe("dark");
  });

  it("reads stored light theme from localStorage on mount", () => {
    renderTheme("light");
    expect(screen.getByTestId("theme-text").textContent).toBe("light");
  });

  it("toggleTheme switches dark → light and persists", () => {
    renderTheme();
    expect(screen.getByTestId("theme-text").textContent).toBe("dark");

    act(() => screen.getByTestId("toggle-btn").click());
    expect(screen.getByTestId("theme-text").textContent).toBe("light");
    expect(localStorage.getItem("oneal-wealth-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("toggleTheme switches light → dark and persists", () => {
    renderTheme("light");
    expect(screen.getByTestId("theme-text").textContent).toBe("light");

    act(() => screen.getByTestId("toggle-btn").click());
    expect(screen.getByTestId("theme-text").textContent).toBe("dark");
    expect(localStorage.getItem("oneal-wealth-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("setTheme updates theme and persists", () => {
    renderTheme();

    act(() => screen.getByTestId("set-light-btn").click());
    expect(screen.getByTestId("theme-text").textContent).toBe("light");
    expect(localStorage.getItem("oneal-wealth-theme")).toBe("light");

    act(() => screen.getByTestId("set-dark-btn").click());
    expect(screen.getByTestId("theme-text").textContent).toBe("dark");
    expect(localStorage.getItem("oneal-wealth-theme")).toBe("dark");
  });

  it("applies data-theme attribute on documentElement", () => {
    renderTheme();

    act(() => screen.getByTestId("set-light-btn").click());
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    act(() => screen.getByTestId("set-dark-btn").click());
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("double toggle returns to original theme", () => {
    renderTheme();

    act(() => screen.getByTestId("toggle-btn").click());
    act(() => screen.getByTestId("toggle-btn").click());
    expect(screen.getByTestId("theme-text").textContent).toBe("dark");
  });

  it("throws when useTheme is used without ThemeProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      render(<TestConsumer />);
    }).toThrow("useTheme must be used within a <ThemeProvider>");
    spy.mockRestore();
  });
});
