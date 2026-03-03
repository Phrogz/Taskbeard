import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TaskListPage } from "./TaskListPage";
import type { PlannerPayload } from "../services/plannerApi";

const planner: PlannerPayload = {
  season: { start_date: "2026-03-01", end_date: "2026-03-10", timezone: "America/Los_Angeles" },
  practices: {
    default_hours_per_day: { sun: 0, mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 0 },
    overrides: [],
  },
  events: [],
  breaks: [],
  teams: [{ id: "team-a", name: "Build", colors: "blues" }],
  colors: { blues: ["#99ccff", "#7cb8ff", "#5a9eff"] },
  members: [],
  tasks: [
    {
      id: "task-1",
      title: "Alpha",
      teams: ["team-a"],
      start_date: "2026-03-01",
      end_date: "2026-03-02",
      est_hours: 2,
      depends_on: [],
      assigned_to: [],
      completed: false,
      priority: "need",
    },
    {
      id: "task-2",
      title: "Beta",
      teams: ["team-a"],
      start_date: "2026-03-03",
      end_date: "2026-03-04",
      est_hours: 4,
      depends_on: [],
      assigned_to: [],
      completed: false,
      priority: "urgent",
    },
  ],
  dates: [],
  dependency_warnings: [],
  student_task_map: {},
};

describe("TaskListPage spreadsheet behavior", () => {
  it("renders existing rows as editable inputs", () => {
    const onCommitTaskRow = vi.fn().mockResolvedValue(undefined);
    render(<TaskListPage planner={planner} onCommitTaskRow={onCommitTaskRow} />);

    expect(screen.getByTestId("task-list-team-a-0-title")).toHaveValue("Alpha");
    expect(screen.getByTestId("task-list-team-a-0-priority")).toHaveValue("need");
    expect(screen.getByTestId("task-list-team-a-0-est_hours")).toHaveValue("2");
  });

  it("Enter commits and moves focus down in the same column", async () => {
    const onCommitTaskRow = vi.fn().mockResolvedValue(undefined);
    render(<TaskListPage planner={planner} onCommitTaskRow={onCommitTaskRow} />);

    const row0Title = screen.getByTestId("task-list-team-a-0-title");
    const row1Title = screen.getByTestId("task-list-team-a-1-title");

    row0Title.focus();
    fireEvent.change(row0Title, { target: { value: "Alpha Updated" } });
    fireEvent.keyDown(row0Title, { key: "Enter" });

    await waitFor(() => {
      expect(onCommitTaskRow).toHaveBeenCalledWith("team-a", {
        task_id: "task-1",
        title: "Alpha Updated",
        priority: "need",
        est_hours: 2,
      });
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(row1Title);
    });
  });

  it("Tab commits and moves focus right, wrapping to next row first column", async () => {
    const onCommitTaskRow = vi.fn().mockResolvedValue(undefined);
    render(<TaskListPage planner={planner} onCommitTaskRow={onCommitTaskRow} />);

    const row0Hours = screen.getByTestId("task-list-team-a-0-est_hours");
    const row1Title = screen.getByTestId("task-list-team-a-1-title");

    row0Hours.focus();
    fireEvent.change(row0Hours, { target: { value: "5" } });
    fireEvent.keyDown(row0Hours, { key: "Tab" });

    await waitFor(() => {
      expect(onCommitTaskRow).toHaveBeenCalledWith("team-a", {
        task_id: "task-1",
        title: "Alpha",
        priority: "need",
        est_hours: 5,
      });
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(row1Title);
    });
  });

  it("Escape restores previous value and blurs", async () => {
    const onCommitTaskRow = vi.fn().mockResolvedValue(undefined);
    render(<TaskListPage planner={planner} onCommitTaskRow={onCommitTaskRow} />);

    const row0Title = screen.getByTestId("task-list-team-a-0-title") as HTMLInputElement;

    row0Title.focus();
    fireEvent.change(row0Title, { target: { value: "Scratch" } });
    fireEvent.keyDown(row0Title, { key: "Escape" });

    await waitFor(() => {
      expect(row0Title.value).toBe("Alpha");
      expect(document.activeElement).not.toBe(row0Title);
      expect(onCommitTaskRow).not.toHaveBeenCalled();
    });
  });
});
