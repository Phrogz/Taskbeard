import { render, screen, waitFor } from "@testing-library/react";
import { ConfigPage } from "./ConfigPage";
import type { PlannerPayload } from "../services/plannerApi";

vi.mock("../services/plannerApi", () => ({
  getConfigYaml: vi.fn(),
  putConfigYaml: vi.fn(),
}));

const { getConfigYaml } = await import("../services/plannerApi");

const planner: PlannerPayload = {
  season: { start_date: "2026-03-01", end_date: "2026-03-10", timezone: "America/Los_Angeles" },
  practices: { default_hours_per_day: {}, overrides: [] },
  events: [],
  breaks: [],
  teams: [],
  colors: {},
  members: [],
  tasks: [],
  dates: [],
  dependency_warnings: [],
  student_task_map: {},
};

describe("ConfigPage", () => {
  it("should show error state instead of loading forever when fetches fail", async () => {
    vi.mocked(getConfigYaml).mockRejectedValue(new Error("Network error"));

    render(<ConfigPage planner={planner} onSaved={vi.fn()} />);

    expect(screen.getByText("Loading config files...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("Loading config files...")).not.toBeInTheDocument();
    });
  });
});
