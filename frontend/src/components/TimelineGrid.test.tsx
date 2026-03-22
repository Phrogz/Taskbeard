import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    onSetTaskPriority: vi.fn(),
    onToggleTaskAssignee: vi.fn(),
    onDeleteTask: vi.fn(),
    onSelectTask: vi.fn(),
    onSelectAssignment: vi.fn(),
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
      showTeams={true}
      showPeople={false}
      selectedTaskPlacement={null}
      selectedAssignment={null}
      renamingTaskId={null}
      renameDraft=""
      dayWidth={35}
      practiceTimeMode={false}
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
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("right-mousedown opens the context menu", async () => {
    const { taskCard, handlers } = renderGrid();

    fireEvent.mouseDown(taskCard, { button: 2, clientX: 100, clientY: 40 });

    expect(handlers.onSelectTask).toHaveBeenCalledWith("task-1", "team-a");
    expect(await screen.findByText("Completed")).toBeInTheDocument();
  });

  it("left-mousedown + no movement + left-mouseup opens the context menu", async () => {
    const { taskCard, handlers } = renderGrid();

    fireEvent.mouseDown(taskCard, { button: 0, clientX: 100, clientY: 40 });
    fireEvent.mouseUp(taskCard, { button: 0, clientX: 100, clientY: 40 });

    expect(handlers.onSelectTask).toHaveBeenCalledWith("task-1", "team-a");
    expect(await screen.findByText("Completed")).toBeInTheDocument();
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

  it("applies drag-passive to non-dragged cards so they don't block drop targets", () => {
    const twoTaskPlanner: PlannerPayload = {
      ...planner,
      tasks: [
        task,
        { ...task, id: "task-2", title: "Design bot", start_date: "2026-03-02", end_date: "2026-03-03" },
      ],
    };
    const { container } = renderGrid({}, twoTaskPlanner);
    const dataTransfer = mockDataTransfer();

    const cards = container.querySelectorAll(".task-card");
    const card1 = Array.from(cards).find((c) => c.textContent?.includes("Build bot"))!;
    const card2 = Array.from(cards).find((c) => c.textContent?.includes("Design bot"))!;

    expect(card1).not.toHaveClass("drag-passive");
    expect(card2).not.toHaveClass("drag-passive");

    fireEvent.dragStart(card1, { dataTransfer, altKey: false });
    expect(card1).not.toHaveClass("drag-passive");
    expect(card2).toHaveClass("drag-passive");

    fireEvent.dragEnd(card1);
    expect(card1).not.toHaveClass("drag-passive");
    expect(card2).not.toHaveClass("drag-passive");
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
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("does not open the task context menu after a click+drag gesture", async () => {
    const { taskCard, handlers } = renderGrid();

    fireEvent.mouseDown(taskCard, { button: 0, clientX: 100, clientY: 40 });
    fireEvent.mouseMove(taskCard, { clientX: 103, clientY: 40 });
    fireEvent.mouseUp(taskCard, { button: 0, clientX: 103, clientY: 40 });
    fireEvent.click(taskCard, { button: 0, clientX: 103, clientY: 40 });

    await waitFor(() => {
      expect(handlers.onSelectTask).not.toHaveBeenCalled();
      expect(screen.queryByText("Completed")).not.toBeInTheDocument();
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

    expect(sunday.getAttribute("title")).toBe("no practice");
    expect(monday.getAttribute("title")).toBe("No Practice");
    expect(monday).toHaveClass("override");
  });

  it("shows 'no practice' tooltip when default hours are zero", () => {
    const plannerZero: PlannerPayload = {
      ...planner,
      practices: {
        default_hours_per_day: { sun: 0, mon: 3, tue: 4, wed: 0, thu: 0, fri: 0, sat: 0 },
        overrides: [],
      },
    };

    const { container } = renderGrid({}, plannerZero);
    const dayCells = container.querySelectorAll(".timeline-header .day-cell");
    const sunday = dayCells[0] as HTMLDivElement | undefined;
    const monday = dayCells[1] as HTMLDivElement | undefined;
    if (!sunday || !monday) {
      throw new Error("Expected day cells to exist");
    }

    expect(sunday.getAttribute("title")).toBe("no practice");
    expect(monday.getAttribute("title")).toBe("2026-03-02: 3h practice");
  });

  it("drop uses the left edge of the task, not the mouse position, as start date", () => {
    const widerPlanner: PlannerPayload = {
      ...planner,
      season: { start_date: "2026-03-01", end_date: "2026-03-07", timezone: "America/Los_Angeles" },
      tasks: [{ ...task, start_date: "2026-03-01", end_date: "2026-03-03" }],
      dates: [
        { date: "2026-03-01", past: false, is_today: false, weekday: "Sun" },
        { date: "2026-03-02", past: false, is_today: false, weekday: "Mon" },
        { date: "2026-03-03", past: false, is_today: false, weekday: "Tue" },
        { date: "2026-03-04", past: false, is_today: false, weekday: "Wed" },
        { date: "2026-03-05", past: false, is_today: false, weekday: "Thu" },
        { date: "2026-03-06", past: false, is_today: false, weekday: "Fri" },
        { date: "2026-03-07", past: false, is_today: false, weekday: "Sat" },
      ],
    };
    const { container, taskCard, handlers } = renderGrid({}, widerPlanner);
    const dataTransfer = mockDataTransfer();
    const dayCells = container.querySelectorAll(".lane-row .lane-day");
    const targetDay = dayCells[5] as HTMLDivElement; // Mar 6 (Fri)

    fireEvent.dragStart(taskCard, { dataTransfer, altKey: false });
    dataTransfer.setData("grab_day_offset", "1");

    fireEvent.dragOver(targetDay, { dataTransfer, altKey: false });
    fireEvent.drop(targetDay, { dataTransfer, altKey: false });

    expect(handlers.onMoveTask).toHaveBeenCalledTimes(1);
    const startDateArg = (handlers.onMoveTask as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(startDateArg).toBe("2026-03-05");
  });

  it("uses the same explicit grid-template columns for header and lane grids", () => {
    const { container } = renderGrid();
    const header = container.querySelector(".timeline-header") as HTMLDivElement | null;
    const laneGrid = container.querySelector(".lane-grid") as HTMLDivElement | null;

    if (!header || !laneGrid) {
      throw new Error("Expected timeline header and lane grid");
    }

    expect(header.style.gridTemplateColumns).toBe("35px 35px 35px");
    expect(laneGrid.style.gridTemplateColumns).toBe("35px 35px 35px");
  });

  it("positions the menu anchor at the mouse location on right-click", async () => {
    const { taskCard, container } = renderGrid();
    const anchor = container.querySelector(".task-menu-anchor") as HTMLElement | null;
    if (!anchor) throw new Error("Expected task-menu-anchor to exist");

    fireEvent.mouseDown(taskCard, { button: 2, clientX: 200, clientY: 150 });
    await screen.findByText("Completed");

    expect(anchor.style.left).toBeTruthy();
    expect(anchor.style.top).toBeTruthy();
  });

  it("positions the menu anchor at the mouse location on left-click-release", async () => {
    const { taskCard, container } = renderGrid();
    const anchor = container.querySelector(".task-menu-anchor") as HTMLElement | null;
    if (!anchor) throw new Error("Expected task-menu-anchor to exist");

    fireEvent.mouseDown(taskCard, { button: 0, clientX: 180, clientY: 120 });
    fireEvent.mouseUp(taskCard, { button: 0, clientX: 180, clientY: 120 });
    await screen.findByText("Completed");

    expect(anchor.style.left).toBeTruthy();
    expect(anchor.style.top).toBeTruthy();
  });

  it("should update task width live while dragging the right resize handle to shrink", () => {
    const widerTask: TaskItem = {
      ...task,
      start_date: "2026-03-01",
      end_date: "2026-03-03",
      est_hours: 9,
    };
    const widerPlanner: PlannerPayload = {
      ...planner,
      season: { start_date: "2026-03-01", end_date: "2026-03-05", timezone: "America/Los_Angeles" },
      tasks: [widerTask],
      dates: [
        { date: "2026-03-01", past: false, is_today: false, weekday: "Sun" },
        { date: "2026-03-02", past: false, is_today: false, weekday: "Mon" },
        { date: "2026-03-03", past: false, is_today: false, weekday: "Tue" },
        { date: "2026-03-04", past: false, is_today: false, weekday: "Wed" },
        { date: "2026-03-05", past: false, is_today: false, weekday: "Thu" },
      ],
    };

    const { container, handlers } = renderGrid({}, widerPlanner);
    const rightHandle = container.querySelector(".task-resize-handle.right") as HTMLDivElement;
    const taskCard = container.querySelector(".task-card") as HTMLDivElement;

    // Original width: 3 days × 35px − 4px = 101px
    expect(taskCard.style.width).toBe("101px");

    // Start resize from the right edge
    fireEvent.mouseDown(rightHandle, { clientX: 200, button: 0 });

    // Drag one day to the left — width should update live
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 165, buttons: 1, bubbles: true }));
    });
    expect(taskCard.style.width).toBe("66px");

    // Release — should commit the shorter range
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: 165, bubbles: true }));
    });
    expect(handlers.onResizeTask).toHaveBeenCalledWith(
      widerTask,
      "2026-03-01",
      "2026-03-02",
      expect.any(Number)
    );
  });

  it("should finish resize when mousemove detects button already released", () => {
    const widerTask: TaskItem = {
      ...task,
      start_date: "2026-03-01",
      end_date: "2026-03-03",
      est_hours: 9,
    };
    const widerPlanner: PlannerPayload = {
      ...planner,
      season: { start_date: "2026-03-01", end_date: "2026-03-05", timezone: "America/Los_Angeles" },
      tasks: [widerTask],
      dates: [
        { date: "2026-03-01", past: false, is_today: false, weekday: "Sun" },
        { date: "2026-03-02", past: false, is_today: false, weekday: "Mon" },
        { date: "2026-03-03", past: false, is_today: false, weekday: "Tue" },
        { date: "2026-03-04", past: false, is_today: false, weekday: "Wed" },
        { date: "2026-03-05", past: false, is_today: false, weekday: "Thu" },
      ],
    };

    const { container, handlers } = renderGrid({}, widerPlanner);
    const rightHandle = container.querySelector(".task-resize-handle.right") as HTMLDivElement;

    fireEvent.mouseDown(rightHandle, { clientX: 200, button: 0 });

    // mousemove with buttons=0 means the button was released outside the element
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 165, buttons: 0, bubbles: true }));
    });

    expect(handlers.onResizeTask).toHaveBeenCalledWith(
      widerTask,
      "2026-03-01",
      "2026-03-02",
      expect.any(Number)
    );
  });

  it("should place a lower-priority task in a gap between higher-priority tasks on row 0", () => {
    const gapPlanner: PlannerPayload = {
      ...planner,
      season: { start_date: "2026-03-01", end_date: "2026-03-08", timezone: "America/Los_Angeles" },
      tasks: [
        { ...task, id: "need-a", title: "Need A", priority: "need", start_date: "2026-03-01", end_date: "2026-03-03" },
        { ...task, id: "need-b", title: "Need B", priority: "need", start_date: "2026-03-07", end_date: "2026-03-08" },
        { ...task, id: "want-c", title: "Want C", priority: "want", start_date: "2026-03-04", end_date: "2026-03-06" },
      ],
      dates: [
        { date: "2026-03-01", past: false, is_today: false, weekday: "Sun" },
        { date: "2026-03-02", past: false, is_today: false, weekday: "Mon" },
        { date: "2026-03-03", past: false, is_today: false, weekday: "Tue" },
        { date: "2026-03-04", past: false, is_today: false, weekday: "Wed" },
        { date: "2026-03-05", past: false, is_today: false, weekday: "Thu" },
        { date: "2026-03-06", past: false, is_today: false, weekday: "Fri" },
        { date: "2026-03-07", past: false, is_today: false, weekday: "Sat" },
        { date: "2026-03-08", past: false, is_today: false, weekday: "Sun" },
      ],
    };

    const { container } = renderGrid({}, gapPlanner);
    const cards = container.querySelectorAll(".task-card");
    const needACard = Array.from(cards).find((c) => c.textContent?.includes("Need A")) as HTMLDivElement;
    const needBCard = Array.from(cards).find((c) => c.textContent?.includes("Need B")) as HTMLDivElement;
    const wantCCard = Array.from(cards).find((c) => c.textContent?.includes("Want C")) as HTMLDivElement;

    expect(needACard.style.top).toBe(needBCard.style.top);
    expect(wantCCard.style.top).toBe(needACard.style.top);
  });

  it("applies completed class to completed task cards", () => {
    const completedPlanner: PlannerPayload = {
      ...planner,
      tasks: [
        { ...task, completed: true },
        { ...task, id: "task-2", title: "Wire bot", start_date: "2026-03-02", end_date: "2026-03-03", completed: false },
      ],
    };

    const { container } = renderGrid({}, completedPlanner);
    const cards = container.querySelectorAll(".task-card");
    const completedCard = Array.from(cards).find((c) => c.textContent?.includes("Build bot"))!;
    const activeCard = Array.from(cards).find((c) => c.textContent?.includes("Wire bot"))!;

    expect(completedCard).toHaveClass("completed");
    expect(activeCard).not.toHaveClass("completed");
  });
});
