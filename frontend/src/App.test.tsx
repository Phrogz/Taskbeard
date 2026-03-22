import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App, hashFromView, viewFromHash } from "./App";

vi.mock("./services/plannerApi", () => ({
  getPlanner: vi.fn(),
  subscribePlannerUpdates: vi.fn(() => () => {}),
  putTasks: vi.fn(() => Promise.resolve()),
  getConfigYaml: vi.fn(() => Promise.resolve("")),
  putConfigYaml: vi.fn(() => Promise.resolve()),
  putConfig: vi.fn(() => Promise.resolve()),
}));

vi.mock("./services/authApi", () => ({
  getClientId: vi.fn(() => Promise.resolve(null)),
  getMe: vi.fn(() => Promise.resolve(null)),
  logout: vi.fn(),
}));

const { getPlanner } = await import("./services/plannerApi");
const DAY_WIDTH_COOKIE = "taskbeard_day_width";

const minimalPlanner = {
  season: { start_date: "2026-03-01", end_date: "2026-03-31" },
  practices: { default_hours_per_day: {}, overrides: [] },
  events: [],
  breaks: [],
  teams: [{ id: "alpha", name: "Alpha", colors: "blue" }],
  colors: {},
  members: [],
  tasks: [],
  dates: [{ date: "2026-03-01", past: false, is_today: true, weekday: "Sun" }],
  dependency_warnings: [],
  student_task_map: {},
};

describe("hash round-trip for view state", () => {
  it("should preserve both-on state when Teams and People are both active", () => {
    const hash = hashFromView("tasks", true, true);
    const restored = viewFromHash(hash);

    expect(restored.tab).toBe("tasks");
    expect(restored.showTeams).toBe(true);
    expect(restored.showPeople).toBe(true);
  });
});

describe("Tab navigation", () => {
  beforeEach(() => {
    window.location.hash = "#teams";
    vi.mocked(getPlanner).mockResolvedValue(minimalPlanner as any);
    document.cookie = `${DAY_WIDTH_COOKIE}=; path=/; max-age=0`;
  });

  afterEach(() => {
    cleanup();
    window.location.hash = "";
    document.cookie = `${DAY_WIDTH_COOKIE}=; path=/; max-age=0`;
  });

  it("should navigate to teams view on first click of Teams from Config tab", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Config" }));
    expect(window.location.hash).toBe("#config");

    await user.click(screen.getByRole("button", { name: "Teams" }));
    expect(window.location.hash).toBe("#teams");
  });

  it("should restore day width from cookie on load", async () => {
    document.cookie = `${DAY_WIDTH_COOKIE}=42; path=/`;

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    const boardWrap = document.querySelector(".board-wrap") as HTMLElement | null;
    expect(boardWrap).not.toBeNull();
    expect(boardWrap?.style.getPropertyValue("--day-width")).toBe("42px");
  });

  it("should persist day width to cookie when zoom changes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Widen day columns" }));

    expect(document.cookie).toContain(`${DAY_WIDTH_COOKIE}=36`);
  });
});
