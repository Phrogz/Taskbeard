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
  priority: "want"
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
      colors: [{ fg: "#111111", bg: "#99ccff" }]
    }
  ],
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

function renderGrid(overrides: Partial<ComponentProps<typeof TimelineGrid>> = {}) {
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
      planner={planner}
      selectedTaskPlacement={null}
      renamingTaskId={null}
      renameDraft=""
      {...handlers}
    />
  );

  const taskCard = screen.getByText("Build bot").closest(".task-card") as HTMLDivElement | null;
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
});
