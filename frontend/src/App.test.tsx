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
  });

  afterEach(() => {
    cleanup();
    window.location.hash = "";
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
});
