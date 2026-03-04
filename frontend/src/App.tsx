import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoardPage } from "./pages/BoardPage";
import { ConfigPage } from "./pages/ConfigPage";
import { TaskListPage } from "./pages/TaskListPage";
import {
  getPlanner,
  subscribePlannerUpdates,
  putTasks,
  type PlannerPayload,
  type TaskItem
} from "./services/plannerApi";

export type Tab = "tasks" | "task-list" | "config";

type ViewState = { tab: Tab; showTeams: boolean; showPeople: boolean };

export function viewFromHash(hash: string): ViewState {
  switch (hash) {
    case "#teams+people":
      return { tab: "tasks", showTeams: true, showPeople: true };
    case "#people":
      return { tab: "tasks", showTeams: false, showPeople: true };
    case "#task-list":
      return { tab: "task-list", showTeams: false, showPeople: false };
    case "#config":
      return { tab: "config", showTeams: false, showPeople: false };
    default:
      return { tab: "tasks", showTeams: true, showPeople: false };
  }
}

export function hashFromView(tab: Tab, showTeams: boolean, showPeople: boolean): string {
  if (tab === "task-list") return "#task-list";
  if (tab === "config") return "#config";
  if (showTeams && showPeople) return "#teams+people";
  if (showPeople && !showTeams) return "#people";
  return "#teams";
}

function slugify(title: string, existingIds?: Set<string>): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").replace(/-+/g, "-") || "task";
  if (!existingIds || !existingIds.has(base)) return base;
  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) counter++;
  return `${base}-${counter}`;
}

type SelectedTaskPlacement = {
  taskId: string;
  teamId: string;
};

export function App() {
  const initialView = viewFromHash(window.location.hash);
  const [planner, setPlanner] = useState<PlannerPayload | null>(null);
  const [tab, setTab] = useState<Tab>(initialView.tab);
  const [showTeams, setShowTeams] = useState(initialView.showTeams);
  const [showPeople, setShowPeople] = useState(initialView.showPeople);
  const [status, setStatus] = useState("Loading...");
  const [selectedTaskPlacement, setSelectedTaskPlacement] = useState<SelectedTaskPlacement | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<{ taskId: string; memberId: string } | null>(null);
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dayWidth, setDayWidth] = useState(35);
  const [undoStack, setUndoStack] = useState<TaskItem[][]>([]);
  const [redoStack, setRedoStack] = useState<TaskItem[][]>([]);

  const cloneTask = (task: TaskItem): TaskItem => ({
    ...task,
    teams: [...(task.teams ?? [])],
    depends_on: [...(task.depends_on ?? [])],
    assigned_to: [...(task.assigned_to ?? [])],
    priority: task.priority ?? "need"
  });

  const cloneTasks = (tasks: TaskItem[]): TaskItem[] => tasks.map((task) => cloneTask(task));

  const tasksEqual = (a: TaskItem[], b: TaskItem[]): boolean =>
    JSON.stringify(a) === JSON.stringify(b);

  const dateToYmd = (value: Date): string => {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const calculateEndDate = (
    startDate: string,
    estHours: number,
    practices: PlannerPayload["practices"]
  ): string => {
    const defaults = practices.default_hours_per_day ?? {};
    const overrides = new Map<string, number>();
    (practices.overrides ?? []).forEach((item) => {
      overrides.set(String(item.date).slice(0, 10), Number(item.hours ?? 0));
    });

    const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    let hoursRemaining = Math.max(0, Number(estHours ?? 0));
    let cursor = new Date(`${startDate}T00:00:00`);

    if (hoursRemaining <= 0) {
      return startDate;
    }

    while (hoursRemaining > 0) {
      const dayKey = dateToYmd(cursor);
      let capacity = 0;
      if (overrides.has(dayKey)) {
        capacity = Number(overrides.get(dayKey) ?? 0);
      } else {
        capacity = Number(defaults[weekdayKeys[cursor.getDay()]] ?? 0);
      }
      if (capacity > 0) {
        hoursRemaining -= capacity;
      }
      if (hoursRemaining > 0) {
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return dateToYmd(cursor);
  };

  const saveTasks = async (nextTasks: TaskItem[], recordHistory = true) => {
    if (!planner) return;
    const previousPlanner = planner;
    const previous = cloneTasks(planner.tasks);
    const next = cloneTasks(nextTasks);

    if (tasksEqual(previous, next)) {
      return;
    }

    if (recordHistory) {
      setUndoStack((current) => [...current, previous]);
      setRedoStack([]);
    }

    setPlanner({ ...planner, tasks: next });

    try {
      await putTasks({ tasks: next });
      void refresh();
    } catch (error) {
      setPlanner(previousPlanner);
      setStatus(error instanceof Error ? error.message : "Failed to save tasks");
    }
  };

  const refresh = async () => {
    try {
      const payload = await getPlanner();
      setPlanner(payload);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribePlannerUpdates(() => {
      void refresh();
    });
    return unsubscribe;
  }, []);

  const suppressHashSync = useRef(false);

  useEffect(() => {
    const nextHash = hashFromView(tab, showTeams, showPeople);
    if (window.location.hash !== nextHash) {
      suppressHashSync.current = true;
      window.history.pushState(null, "", nextHash);
    }
  }, [tab, showTeams, showPeople]);

  const applyHash = useCallback(() => {
    if (suppressHashSync.current) {
      suppressHashSync.current = false;
      return;
    }
    const view = viewFromHash(window.location.hash);
    setTab(view.tab);
    setShowTeams(view.showTeams);
    setShowPeople(view.showPeople);
  }, []);

  useEffect(() => {
    window.addEventListener("popstate", applyHash);
    return () => window.removeEventListener("popstate", applyHash);
  }, [applyHash]);

  const undo = async () => {
    if (!planner || undoStack.length === 0) return;
    const current = cloneTasks(planner.tasks);
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((value) => value.slice(0, -1));
    setRedoStack((value) => [...value, current]);
    await saveTasks(previous, false);
  };

  const redo = async () => {
    if (!planner || redoStack.length === 0) return;
    const current = cloneTasks(planner.tasks);
    const next = redoStack[redoStack.length - 1];
    setRedoStack((value) => value.slice(0, -1));
    setUndoStack((value) => [...value, current]);
    await saveTasks(next, false);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);

      const hasModifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (hasModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          void redo();
        } else {
          void undo();
        }
        return;
      }

      if (hasModifier && key === "y") {
        event.preventDefault();
        void redo();
        return;
      }

      if (isTypingTarget || renamingTaskId) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedAssignment) {
          event.preventDefault();
          const task = planner?.tasks.find((item) => item.id === selectedAssignment.taskId);
          if (task) {
            setSelectedAssignment(null);
            void onToggleTaskAssignee(task, selectedAssignment.memberId);
          }
          return;
        }
        if (selectedTaskPlacement) {
          event.preventDefault();
          const task = planner?.tasks.find((item) => item.id === selectedTaskPlacement.taskId);
          if (task) {
            void onDeleteTask(task, selectedTaskPlacement.teamId);
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [planner, renamingTaskId, selectedTaskPlacement, selectedAssignment, undoStack, redoStack]);

  const onMoveTask = async (
    task: TaskItem,
    startDate: string,
    sourceTeamId: string,
    targetTeamId: string,
    copyToTeam: boolean
  ) => {
    if (!planner) return;
    const nextTasks = cloneTasks(planner.tasks);
    const index = nextTasks.findIndex((item) => item.id === task.id);
    if (index === -1) return;

    const updated = cloneTask(nextTasks[index]);
    updated.start_date = startDate;
    updated.end_date = calculateEndDate(startDate, Number(updated.est_hours ?? 0), planner.practices);

    if (sourceTeamId && targetTeamId && sourceTeamId !== targetTeamId) {
      if (copyToTeam) {
        updated.teams = Array.from(new Set([...(updated.teams ?? []), targetTeamId]));
      } else {
        updated.teams = [targetTeamId];
      }
    }

    nextTasks[index] = updated;
    await saveTasks(nextTasks);
  };

  const onResizeTask = async (
    task: TaskItem,
    startDate: string,
    endDate: string,
    estHours: number
  ) => {
    if (!planner) return;
    const nextTasks = cloneTasks(planner.tasks);
    const index = nextTasks.findIndex((item) => item.id === task.id);
    if (index === -1) return;
    nextTasks[index] = {
      ...nextTasks[index],
      start_date: startDate,
      end_date: endDate,
      est_hours: estHours
    };
    await saveTasks(nextTasks);
  };

  const onToggleTaskComplete = async (task: TaskItem) => {
    if (!planner) return;
    const nextTasks = cloneTasks(planner.tasks);
    const index = nextTasks.findIndex((item) => item.id === task.id);
    if (index === -1) return;
    nextTasks[index] = {
      ...nextTasks[index],
      completed: !nextTasks[index].completed
    };
    setSelectedTaskPlacement(null);
    await saveTasks(nextTasks);
  };

  const onSetTaskPriority = async (task: TaskItem, priority: TaskItem["priority"]) => {
    if (!planner) return;
    const nextTasks = cloneTasks(planner.tasks);
    const index = nextTasks.findIndex((item) => item.id === task.id);
    if (index === -1) return;
    nextTasks[index] = { ...nextTasks[index], priority };
    await saveTasks(nextTasks);
  };

  const onToggleTaskAssignee = async (task: TaskItem, memberId: string) => {
    if (!planner) return;
    const nextTasks = cloneTasks(planner.tasks);
    const index = nextTasks.findIndex((item) => item.id === task.id);
    if (index === -1) return;

    const currentAssignees = nextTasks[index].assigned_to ?? [];
    const exists = currentAssignees.includes(memberId);
    const assigned_to = exists
      ? currentAssignees.filter((item) => item !== memberId)
      : [...currentAssignees, memberId];

    nextTasks[index] = {
      ...nextTasks[index],
      assigned_to
    };
    await saveTasks(nextTasks);
  };

  const onDeleteTask = async (task: TaskItem, teamId: string) => {
    if (!planner) return;
    const nextTasks = cloneTasks(planner.tasks);
    const index = nextTasks.findIndex((item) => item.id === task.id);
    if (index === -1) return;

    const current = cloneTask(nextTasks[index]);
    const nextTeams = (current.teams ?? []).filter((item) => item !== teamId);
    if (nextTeams.length === 0) {
      nextTasks.splice(index, 1);
    } else {
      current.teams = nextTeams;
      nextTasks[index] = current;
    }

    if (
      selectedTaskPlacement &&
      selectedTaskPlacement.taskId === task.id &&
      selectedTaskPlacement.teamId === teamId
    ) {
      setSelectedTaskPlacement(null);
    }
    if (renamingTaskId === task.id) {
      setRenamingTaskId(null);
      setRenameDraft("");
    }
    await saveTasks(nextTasks);
  };

  const onStartRenameTask = (task: TaskItem, teamId: string) => {
    setSelectedTaskPlacement({ taskId: task.id, teamId });
    setRenamingTaskId(task.id);
    setRenameDraft(task.title);
  };

  const onSelectTask = (taskId: string, teamId: string) => {
    setSelectedTaskPlacement({ taskId, teamId });
    setSelectedAssignment(null);
  };

  const onSelectAssignment = (taskId: string, memberId: string) => {
    setSelectedAssignment({ taskId, memberId });
    setSelectedTaskPlacement(null);
  };

  const onCreateTaskAt = async (startDate: string, teamId: string) => {
    if (!planner) return;
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);

    const existingIds = new Set(planner.tasks.map((t) => t.id));
    const newTask: TaskItem = {
      id: slugify("New Task", existingIds),
      title: "New Task",
      teams: [teamId],
      start_date: startDate,
      end_date: dateToYmd(end),
      est_hours: 0,
      depends_on: [],
      assigned_to: [],
      completed: false,
      priority: "need"
    };

    setSelectedTaskPlacement({ taskId: newTask.id, teamId });
    setRenamingTaskId(newTask.id);
    setRenameDraft("New Task");
    await saveTasks([...cloneTasks(planner.tasks), newTask]);
  };

  const onCommitRename = async () => {
    if (!planner || !renamingTaskId) return;
    const title = renameDraft.trim();
    if (!title) {
      setRenamingTaskId(null);
      setRenameDraft("");
      return;
    }

    const nextTasks = cloneTasks(planner.tasks);
    const index = nextTasks.findIndex((item) => item.id === renamingTaskId);
    if (index === -1) {
      setRenamingTaskId(null);
      setRenameDraft("");
      return;
    }

    const oldId = renamingTaskId;
    const otherIds = new Set(nextTasks.filter((_, i) => i !== index).map((t) => t.id));
    const newId = slugify(title, otherIds);

    nextTasks[index] = { ...nextTasks[index], title, id: newId };

    if (newId !== oldId) {
      for (const t of nextTasks) {
        t.depends_on = (t.depends_on ?? []).map((d) => (d === oldId ? newId : d));
      }
      if (selectedTaskPlacement?.taskId === oldId) {
        setSelectedTaskPlacement({ ...selectedTaskPlacement, taskId: newId });
      }
    }

    setRenamingTaskId(null);
    setRenameDraft("");
    await saveTasks(nextTasks);
  };

  const onCommitTaskRow = async (
    teamId: string,
    row: { task_id: string | null; title: string; priority: TaskItem["priority"]; est_hours: number; description: string }
  ) => {
    if (!planner) return;
    const title = row.title.trim();
    if (!title) return;

    const estHours = Math.max(0, Number(row.est_hours ?? 0));
    const nextTasks = cloneTasks(planner.tasks);

    if (row.task_id) {
      const index = nextTasks.findIndex((task) => task.id === row.task_id);
      if (index === -1) return;
      const current = nextTasks[index];
      const oldId = current.id;
      const otherIds = new Set(nextTasks.filter((_, i) => i !== index).map((t) => t.id));
      const newId = slugify(title, otherIds);
      nextTasks[index] = {
        ...current,
        id: newId,
        title,
        priority: row.priority,
        est_hours: estHours,
        description: row.description,
        teams: current.teams.includes(teamId) ? current.teams : [...current.teams, teamId],
      };
      if (newId !== oldId) {
        for (const t of nextTasks) {
          t.depends_on = (t.depends_on ?? []).map((d) => (d === oldId ? newId : d));
        }
      }
      await saveTasks(nextTasks);
      return;
    }

    const seasonStart = planner.season.start_date;
    const existingIds = new Set(nextTasks.map((t) => t.id));
    const newTask: TaskItem = {
      id: slugify(title, existingIds),
      title,
      teams: [teamId],
      start_date: seasonStart,
      end_date: calculateEndDate(seasonStart, estHours, planner.practices),
      est_hours: estHours,
      depends_on: [],
      assigned_to: [],
      completed: false,
      priority: row.priority,
      description: row.description,
    };

    await saveTasks([...nextTasks, newTask]);
  };

  const onCancelRename = () => {
    setRenamingTaskId(null);
    setRenameDraft("");
  };

  if (!planner) {
    return <div className="app-shell">{status}</div>;
  }

  const toggleTeams = () => {
    if (showTeams && !showPeople) {
      setShowTeams(false);
      setShowPeople(true);
      return;
    }
    setShowTeams((value) => !value);
    setTab("tasks");
  };

  const togglePeople = () => {
    if (showPeople && !showTeams) {
      setShowPeople(false);
      setShowTeams(true);
      return;
    }
    setShowPeople((value) => !value);
    setTab("tasks");
  };

  return (
    <div className="app-shell">
      <nav className="tabs">
        <div className="tabs-segmented" role="group" aria-label="Task views">
          <button className={tab === "tasks" && showTeams ? "active" : ""} onClick={toggleTeams}>
            Teams
          </button>
          <span className="tabs-separator" aria-hidden="true" />
          <button className={tab === "tasks" && showPeople ? "active" : ""} onClick={togglePeople}>
            People
          </button>
        </div>
        <button className={tab === "task-list" ? "active" : ""} onClick={() => setTab("task-list")}>
          Task List
        </button>
        <button className={tab === "config" ? "active" : ""} onClick={() => setTab("config")}>
          Config
        </button>
        {tab === "tasks" && (
          <div className="zoom-controls">
            <button
              className="zoom-btn"
              onClick={() => setDayWidth((w) => Math.max(10, w - 1))}
              aria-label="Narrow day columns"
            >
              &minus;
            </button>
            <button
              className="zoom-btn"
              onClick={() => setDayWidth((w) => w + 1)}
              aria-label="Widen day columns"
            >
              +
            </button>
          </div>
        )}
      </nav>

      {tab === "tasks" ? (
        <BoardPage
          planner={planner}
          showTeams={showTeams}
          showPeople={showPeople}
          dayWidth={dayWidth}
          onMoveTask={onMoveTask}
          onResizeTask={onResizeTask}
          onToggleTaskComplete={onToggleTaskComplete}
          onSetTaskPriority={onSetTaskPriority}
          onToggleTaskAssignee={onToggleTaskAssignee}
          onDeleteTask={onDeleteTask}
          selectedTaskPlacement={selectedTaskPlacement}
          selectedAssignment={selectedAssignment}
          renamingTaskId={renamingTaskId}
          renameDraft={renameDraft}
          onSelectTask={onSelectTask}
          onSelectAssignment={onSelectAssignment}
          onClearSelection={() => {
            setSelectedTaskPlacement(null);
            setSelectedAssignment(null);
            setRenamingTaskId(null);
            setRenameDraft("");
          }}
          onStartRenameTask={onStartRenameTask}
          onRenameDraftChange={setRenameDraft}
          onCommitRename={onCommitRename}
          onCancelRename={onCancelRename}
          onCreateTaskAt={onCreateTaskAt}
        />
      ) : tab === "task-list" ? (
        <TaskListPage planner={planner} onCommitTaskRow={onCommitTaskRow} />
      ) : (
        <ConfigPage
          planner={planner}
          onSaved={() => {
            void refresh();
          }}
        />
      )}

      {status && <footer className="status">{status}</footer>}
    </div>
  );
}
