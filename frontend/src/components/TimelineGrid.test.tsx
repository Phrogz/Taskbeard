import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { TimelineGrid } from "./TimelineGrid";
import type { PlannerPayload, TaskItem } from "../services/plannerApi";

const task: TaskItem = {
  id: "task-1",
  title: "Build bot",
  teams: ["team-a"],
  start_date: "2026-03-01",
  end_date: "2026-03-02",
  est_hours: 6,
  depends_on: [],
  assigned_to: [],
  completed: false,
  priority: "need"
};

const planner: PlannerPayload = {
  season: { start_date: "2026-03-01", end_date: "2026-03-03", timezone: "America/Los_Angeles" },
  practices: {
    default_hours_per_day: { sun: 0, mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 0 },
    overrides: []
  },
  events: [],
  breaks: [],
  teams: [
    {
      id: "team-a",
      name: "Build",
      colors: "blues"
    }
  ],
  colors: {
    blues: ["#99ccff", "#7cb8ff", "#5a9eff"]
  },
  members: [],
  tasks: [task],
  dates: [
    { date: "2026-03-01", past: false, is_today: false, weekday: "Sun" },
    { date: "2026-03-02", past: false, is_today: false, weekday: "Mon" },
    { date: "2026-03-03", past: false, is_today: false, weekday: "Tue" }
  ],
  dependency_warnings: [],
  student_task_map: {}
};

function renderGrid(
  overrides: Partial<ComponentProps<typeof TimelineGrid>> = {},
  plannerOverride: PlannerPayload = planner
) {
  const handlers = {
    onMoveTask: vi.fn(),
    onResizeTask: vi.fn(),
    onToggleTaskComplete: vi.fn(),
    onToggleTaskAssignee: vi.fn(),
    onDeleteTask: vi.fn(),
    onSelectTask: vi.fn(),
    onClearSelection: vi.fn(),
    onStartRenameTask: vi.fn(),
    onRenameDraftChange: vi.fn(),
    onCommitRename: vi.fn(),
    onCancelRename: vi.fn(),
    onCreateTaskAt: vi.fn(),
    ...overrides,
  };

  const view = render(
    <TimelineGrid
      planner={plannerOverride}
      selectedTaskPlacement={null}
      renamingTaskId={null}
      renameDraft=""
      {...handlers}
    />
  );

  const taskCard =
    (screen.queryByText("Build bot")?.closest(".task-card") as HTMLDivElement | null) ??
    (view.container.querySelector(".task-card") as HTMLDivElement | null);
  if (!taskCard) {
    throw new Error("Expected task card to be rendered");
  }

  return { ...view, taskCard, handlers };
}

function mockDataTransfer() {
  const store = new Map<string, string>();
  return {
    setData: (key: string, value: string) => {
      store.set(key, value);
    },
    getData: (key: string) => store.get(key) ?? "",
    effectAllowed: "",
    dropEffect: "",
  };
}

describe("TimelineGrid drag interactions", () => {
  it("left-mousedown alone does not open the context menu", () => {
    const { taskCard, handlers } = renderGrid();

    fireEvent.mouseDown(taskCard, { button: 0, clientX: 100, clientY: 40 });

    expect(handlers.onSelectTask).not.toHaveBeenCalled();
    expect(screen.queryByText("Complete")).not.toBeInTheDocument();
  });

  it("right-mousedown opens the context menu", async () => {
    const { taskCard, handlers } = renderGrid();

    fireEvent.mouseDown(taskCard, { button: 2, clientX: 100, clientY: 40 });

    expect(handlers.onSelectTask).toHaveBeenCalledWith("task-1", "team-a");
    expect(await screen.findByText("Complete")).toBeInTheDocument();
  });

  it("left-mousedown + no movement + left-mouseup opens the context menu", async () => {
    const { taskCard, handlers } = renderGrid();

    fireEvent.mouseDown(taskCard, { button: 0, clientX: 100, clientY: 40 });
    fireEvent.mouseUp(taskCard, { button: 0, clientX: 100, clientY: 40 });

    expect(handlers.onSelectTask).toHaveBeenCalledWith("task-1", "team-a");
    expect(await screen.findByText("Complete")).toBeInTheDocument();
  });

  it("left-mousedown + mousemove drags the task", () => {
    const { container, taskCard, handlers } = renderGrid();
    const dataTransfer = mockDataTransfer();
    const dayCells = container.querySelectorAll(".lane-day");
    const targetDay = dayCells[2] as HTMLDivElement | undefined;
    if (!targetDay) {
      throw new Error("Expected target lane day to exist");
    }

    fireEvent.mouseDown(taskCard, { button: 0, clientX: 100, clientY: 40 });
    fireEvent.mouseMove(taskCard, { clientX: 106, clientY: 40 });
    fireEvent.dragStart(taskCard, { dataTransfer, altKey: false });
    fireEvent.dragOver(targetDay, { dataTransfer, altKey: false });
    fireEvent.drop(targetDay, { dataTransfer, altKey: false });

    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveTask).toHaveBeenCalledWith(task, "2026-03-03", "team-a", "team-a", false);
  });

  it("does not open the context menu when drag starts before mousemove threshold", () => {
    const { container, taskCard, handlers } = renderGrid();
    const dataTransfer = mockDataTransfer();
    const dayCells = container.querySelectorAll(".lane-day");
    const targetDay = dayCells[2] as HTMLDivElement | undefined;
    if (!targetDay) {
      throw new Error("Expected target lane day to exist");
    }

    fireEvent.mouseDown(taskCard, { button: 0, clientX: 100, clientY: 40 });
    fireEvent.dragStart(taskCard, { dataTransfer, altKey: false });
    fireEvent.dragOver(targetDay, { dataTransfer, altKey: false });
    fireEvent.drop(targetDay, { dataTransfer, altKey: false });
    fireEvent.mouseUp(taskCard, { button: 0, clientX: 101, clientY: 40 });

    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1);
    expect(handlers.onSelectTask).not.toHaveBeenCalled();
    expect(screen.queryByText("Complete")).not.toBeInTheDocument();
  });

  it("does not open the task context menu after a click+drag gesture", async () => {
    const { taskCard, handlers } = renderGrid();

    fireEvent.mouseDown(taskCard, { button: 0, clientX: 100, clientY: 40 });
    fireEvent.mouseMove(taskCard, { clientX: 103, clientY: 40 });
    fireEvent.mouseUp(taskCard, { button: 0, clientX: 103, clientY: 40 });
    fireEvent.click(taskCard, { button: 0, clientX: 103, clientY: 40 });

    await waitFor(() => {
      expect(handlers.onSelectTask).not.toHaveBeenCalled();
      expect(screen.queryByText("Complete")).not.toBeInTheDocument();
    });
  });

  it("allows dropping onto a break day", () => {
    const plannerWithBreak: PlannerPayload = {
      ...planner,
      breaks: [
        {
          id: "break-1",
          name: "Spring Break",
          start_date: "2026-03-03",
          end_date: "2026-03-03",
        },
      ],
    };
    const { container, taskCard, handlers } = renderGrid({}, plannerWithBreak);
    const dataTransfer = mockDataTransfer();
    const dayCells = container.querySelectorAll(".lane-day");
    const targetDay = dayCells[2] as HTMLDivElement | undefined;
    if (!targetDay) {
      throw new Error("Expected target lane day to exist");
    }

    fireEvent.dragStart(taskCard, { dataTransfer, altKey: false });
    fireEvent.dragOver(targetDay, { dataTransfer, altKey: false });
    fireEvent.drop(targetDay, { dataTransfer, altKey: false });

    expect(handlers.onMoveTask).toHaveBeenCalledWith(task, "2026-03-03", "team-a", "team-a", false);
  });

  it("applies priority classes for urgent/need/want", () => {
    const plannerPriorities: PlannerPayload = {
      ...planner,
      tasks: [
        { ...task, id: "urgent-1", title: "Urgent", priority: "urgent" },
        { ...task, id: "need-1", title: "Need", priority: "need", start_date: "2026-03-02", end_date: "2026-03-02" },
        { ...task, id: "want-1", title: "Want", priority: "want", start_date: "2026-03-03", end_date: "2026-03-03" },
      ],
    };

    renderGrid({}, plannerPriorities);

    expect(screen.getByText("Urgent").closest(".task-card")).toHaveClass("task-priority-urgent");
    expect(screen.getByText("Need").closest(".task-card")).toHaveClass("task-priority-need");
    expect(screen.getByText("Want").closest(".task-card")).toHaveClass("task-priority-want");
  });

  it("shows practice-hours tooltip on normal days and override label on override days", () => {
    const plannerWithOverride: PlannerPayload = {
      ...planner,
      practices: {
        default_hours_per_day: { sun: 0, mon: 3, tue: 4, wed: 0, thu: 0, fri: 0, sat: 0 },
        overrides: [{ date: "2026-03-02", hours: 0, label: "No Practice" }],
      },
    };

    const { container } = renderGrid({}, plannerWithOverride);
    const dayCells = container.querySelectorAll(".timeline-header .day-cell");
    const sunday = dayCells[0] as HTMLDivElement | undefined;
    const monday = dayCells[1] as HTMLDivElement | undefined;
    if (!sunday || !monday) {
      throw new Error("Expected day cells to exist");
    }

    expect(sunday.getAttribute("title")).toBe("2026-03-01: 0h practice");
    expect(monday.getAttribute("title")).toBe("No Practice");
    expect(monday).toHaveClass("override");
  });

  it("uses the same explicit grid-template columns for header and lane grids", () => {
    const { container } = renderGrid();
    const header = container.querySelector(".timeline-header") as HTMLDivElement | null;
    const laneGrid = container.querySelector(".lane-grid") as HTMLDivElement | null;

    if (!header || !laneGrid) {
      throw new Error("Expected timeline header and lane grid");
    }

    expect(header.style.gridTemplateColumns).toBe("repeat(3, 35px)");
    expect(laneGrid.style.gridTemplateColumns).toBe("repeat(3, 35px)");
  });
});
