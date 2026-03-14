import { useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Users, Flag, Trash2, Check, UserMinus, ChevronRight } from "lucide-react";
import type { PlannerPayload, TaskItem } from "../services/plannerApi";
import { teamColorAt, teamDefaultColor } from "../services/teamColors";

const logo = new URL("../logo.svg", import.meta.url).href;

type SelectedTaskPlacement = {
  taskId: string;
  teamId: string;
};

type Props = {
  planner: PlannerPayload;
  showTeams: boolean;
  showPeople: boolean;
  onMoveTask: (
    task: TaskItem,
    startDate: string,
    sourceTeamId: string,
    targetTeamId: string,
    copyToTeam: boolean
  ) => void;
  onResizeTask: (task: TaskItem, startDate: string, endDate: string, estHours: number) => void;
  onToggleTaskComplete: (task: TaskItem) => void;
  onSetTaskPriority: (task: TaskItem, priority: TaskItem["priority"]) => void;
  onToggleTaskAssignee: (task: TaskItem, memberId: string) => void;
  onDeleteTask: (task: TaskItem, teamId: string) => void;
  selectedTaskPlacement: SelectedTaskPlacement | null;
  selectedAssignment: { taskId: string; memberId: string } | null;
  renamingTaskId: string | null;
  renameDraft: string;
  onSelectTask: (taskId: string, teamId: string) => void;
  onSelectAssignment: (taskId: string, memberId: string) => void;
  onClearSelection: () => void;
  onStartRenameTask: (task: TaskItem, teamId: string) => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onCreateTaskAt: (startDate: string, teamId: string) => void;
  dayWidth: number;
  practiceTimeMode: boolean;
  readOnly?: boolean;
};

const SHORT_WEEKDAYS: Record<string, string> = {
  Mon: "M", Tue: "T", Wed: "W", Thu: "Θ", Fri: "F", Sat: "S", Sun: "S",
};

const CARD_HEIGHT = 30;
const CARD_TOP = 2;
const CARD_BOTTOM = 2;
const ROW_GAP = 1;
const TEAM_LABEL_WIDTH = 120;
const PERSON_ROW_HEIGHT = 20;

function dateDiff(a: string, b: string): number {
  const aMs = new Date(`${a}T00:00:00`).getTime();
  const bMs = new Date(`${b}T00:00:00`).getTime();
  return Math.round((aMs - bMs) / (24 * 60 * 60 * 1000));
}

type PositionedTask = {
  task: TaskItem;
  startOffset: number;
  endOffset: number;
  span: number;
  row: number;
};

const PRIORITY_RANK: Record<string, number> = { urgent: 0, need: 1, want: 2 };

function positionLaneTasks(tasks: TaskItem[], seasonStart: string): { items: PositionedTask[]; rowCount: number } {
  const intervals = tasks
    .map((task) => {
      const startOffset = Math.max(0, dateDiff(task.start_date, seasonStart));
      const endOffset = Math.max(startOffset, dateDiff(task.end_date, seasonStart));
      return {
        task,
        startOffset,
        endOffset,
        span: endOffset - startOffset + 1
      };
    })
    .sort((a, b) => {
      const pa = PRIORITY_RANK[a.task.priority] ?? 1;
      const pb = PRIORITY_RANK[b.task.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
      if (a.span !== b.span) return b.span - a.span;
      return a.task.title.localeCompare(b.task.title);
    });

  const rowIntervals: Array<Array<{ start: number; end: number }>> = [];
  const positioned: PositionedTask[] = [];

  intervals.forEach((interval) => {
    let rowIndex = rowIntervals.findIndex(
      (row) => !row.some((existing) => interval.startOffset <= existing.end && interval.endOffset >= existing.start)
    );
    if (rowIndex === -1) {
      rowIndex = rowIntervals.length;
      rowIntervals.push([]);
    }
    rowIntervals[rowIndex].push({ start: interval.startOffset, end: interval.endOffset });

    positioned.push({ ...interval, row: rowIndex });
  });

  return { items: positioned, rowCount: Math.max(rowIntervals.length, 1) };
}

export function TimelineGrid({
  planner,
  showTeams,
  showPeople,
  onMoveTask,
  onResizeTask,
  onToggleTaskComplete,
  onSetTaskPriority,
  onToggleTaskAssignee,
  onDeleteTask,
  selectedTaskPlacement,
  selectedAssignment,
  renamingTaskId,
  renameDraft,
  onSelectTask,
  onSelectAssignment,
  onClearSelection,
  onStartRenameTask,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  onCreateTaskAt,
  dayWidth,
  practiceTimeMode,
  readOnly,
}: Props) {
  const seasonStart = planner.season.start_date;
  const seasonEnd = planner.season.end_date;
  const days = planner.dates;
  const resizeStateRef = useRef<{
    task: TaskItem;
    side: "left" | "right";
    startClientX: number;
    originalEdgePixel: number;
    originalStartOffset: number;
    originalEndOffset: number;
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<{
    taskKey: string;
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [menuAnchorPos, setMenuAnchorPos] = useState<{ left: number; top: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const menuOpenRequestKeyRef = useRef<string | null>(null);
  const pointerStateRef = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null);
  const dragTaskKeyRef = useRef<string | null>(null);
  const suppressClickUntilRef = useRef(0);

  const anchorPosFromEvent = (ev: React.MouseEvent) => {
    const grid = (ev.currentTarget as HTMLElement).closest(".lane-grid");
    if (!grid) return { left: 0, top: 0 };
    const rect = grid.getBoundingClientRect();
    return { left: ev.clientX - rect.left, top: ev.clientY - rect.top };
  };

  const monthSpans = useMemo(() => {
    const spans: Array<{ key: string; label: string; spanDays: number }> = [];
    if (days.length === 0) return spans;

    let currentKey = "";
    let currentLabel = "";
    let currentSpan = 0;

    days.forEach((day, index) => {
      const date = new Date(`${day.date}T00:00:00`);
      const monthLabel = date.toLocaleString("en-US", { month: "long" });
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;

      if (index === 0) {
        currentKey = monthKey;
        currentLabel = monthLabel;
        currentSpan = 1;
        return;
      }

      if (monthKey === currentKey) {
        currentSpan += 1;
        return;
      }

      spans.push({ key: currentKey, label: currentLabel, spanDays: currentSpan });
      currentKey = monthKey;
      currentLabel = monthLabel;
      currentSpan = 1;
    });

    spans.push({ key: currentKey, label: currentLabel, spanDays: currentSpan });
    return spans;
  }, [days]);

  const breakDateSet = useMemo(() => {
    const values = new Set<string>();
    planner.breaks.forEach((schoolBreak) => {
      const start = new Date(`${String(schoolBreak.start_date).slice(0, 10)}T00:00:00`);
      const end = new Date(`${String(schoolBreak.end_date).slice(0, 10)}T00:00:00`);
      const cursor = new Date(start);
      while (cursor <= end) {
        const yyyy = cursor.getFullYear();
        const mm = String(cursor.getMonth() + 1).padStart(2, "0");
        const dd = String(cursor.getDate()).padStart(2, "0");
        values.add(`${yyyy}-${mm}-${dd}`);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return values;
  }, [planner.breaks]);

  const inactiveDateSet = useMemo(() => {
    const defaults = planner.practices.default_hours_per_day ?? {};
    const overrideHoursByDate = new Map<string, number>();
    (planner.practices.overrides ?? []).forEach((item) => {
      overrideHoursByDate.set(String(item.date).slice(0, 10), Number(item.hours ?? 0));
    });

    const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    return new Set(
      days
        .filter((day) => {
          if (breakDateSet.has(day.date)) return true;
          const overrideHours = overrideHoursByDate.get(day.date);
          if (overrideHours !== undefined) {
            return overrideHours <= 0;
          }
          const weekdayIndex = new Date(`${day.date}T00:00:00`).getDay();
          const weekdayKey = weekdayKeys[weekdayIndex];
          return Number(defaults[weekdayKey] ?? 0) <= 0;
        })
        .map((day) => day.date)
    );
  }, [days, planner.practices.default_hours_per_day, planner.practices.overrides, breakDateSet]);

  const practiceOverrideByDate = useMemo(() => {
    const values = new Map<string, { hours: number; label: string }>();
    (planner.practices.overrides ?? []).forEach((item) => {
      const date = String(item.date).slice(0, 10);
      values.set(date, {
        hours: Number(item.hours ?? 0),
        label: String(item.label ?? "Override"),
      });
    });
    return values;
  }, [planner.practices.overrides]);

  const practiceHoursByDate = useMemo(() => {
    const defaults = planner.practices.default_hours_per_day ?? {};
    const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const values = new Map<string, number>();

    days.forEach((day) => {
      if (breakDateSet.has(day.date)) {
        values.set(day.date, 0);
        return;
      }
      const override = practiceOverrideByDate.get(day.date);
      if (override) {
        values.set(day.date, override.hours);
        return;
      }
      const weekdayIndex = new Date(`${day.date}T00:00:00`).getDay();
      const weekdayKey = weekdayKeys[weekdayIndex];
      values.set(day.date, Number(defaults[weekdayKey] ?? 0));
    });

    return values;
  }, [days, planner.practices.default_hours_per_day, practiceOverrideByDate, breakDateSet]);

  const eventDateSet = useMemo(() => {
    const values = new Set<string>();
    planner.events.forEach((event) => {
      const start = new Date(`${String(event.start_date).slice(0, 10)}T00:00:00`);
      const end = new Date(`${String(event.end_date).slice(0, 10)}T00:00:00`);
      const cursor = new Date(start);
      while (cursor <= end) {
        const yyyy = cursor.getFullYear();
        const mm = String(cursor.getMonth() + 1).padStart(2, "0");
        const dd = String(cursor.getDate()).padStart(2, "0");
        values.add(`${yyyy}-${mm}-${dd}`);
        cursor.setDate(cursor.getDate() + 1);
      }
      (event.travel ?? []).forEach((t) => values.add(String(t.date).slice(0, 10)));
    });
    return values;
  }, [planner.events]);

  const dayWidths = useMemo(() => {
    if (!practiceTimeMode) return days.map(() => dayWidth);
    return days.map((day) => {
      const hours = practiceHoursByDate.get(day.date) ?? 0;
      const isBreakOrEvent = breakDateSet.has(day.date) || eventDateSet.has(day.date);
      const effectiveHours = hours > 0 ? hours : (isBreakOrEvent ? 1 : 0);
      return effectiveHours / 2 * dayWidth;
    });
  }, [practiceTimeMode, days, dayWidth, practiceHoursByDate, breakDateSet, eventDateSet]);

  const cumulativeOffsets = useMemo(() => {
    const offsets = [0];
    for (let i = 0; i < dayWidths.length; i++) {
      offsets.push(offsets[i] + dayWidths[i]);
    }
    return offsets;
  }, [dayWidths]);

  const pixelLeftForDay = (i: number) => cumulativeOffsets[i] ?? 0;
  const pixelWidthForSpan = (start: number, span: number) =>
    (cumulativeOffsets[start + span] ?? cumulativeOffsets[cumulativeOffsets.length - 1]) -
    (cumulativeOffsets[start] ?? 0);

  const dayIndexAtPixelX = (px: number) => {
    for (let i = 0; i < cumulativeOffsets.length - 1; i++) {
      if (px < cumulativeOffsets[i + 1]) return i;
    }
    return days.length - 1;
  };

  const totalWidth = cumulativeOffsets[days.length] ?? 0;
  const dayColumns = dayWidths.map((w) => w + "px").join(" ");

  const laneData = useMemo(() => {
    return planner.teams.map((team) => {
      const laneTasks = planner.tasks
        .filter((task) => task.teams.includes(team.id))
        .filter((task) => task.start_date >= seasonStart && task.start_date <= seasonEnd);
      const { items: positionedTasks, rowCount } = positionLaneTasks(laneTasks, seasonStart);
      const laneHeight = CARD_TOP + rowCount * CARD_HEIGHT + (rowCount - 1) * ROW_GAP + CARD_BOTTOM;
      return {
        team,
        positionedTasks,
        laneHeight,
      };
    });
  }, [planner.teams, planner.tasks, seasonStart, seasonEnd]);

  const todayIndex = useMemo(() => days.findIndex(d => d.is_today), [days]);

  const peopleOnlyMode = showPeople && !showTeams;

  const personLaneData = useMemo(() => {
    if (!peopleOnlyMode) return [];
    const memberById = new Map(planner.members.map((m) => [m.id, m]));
    const allIds = new Set<string>();
    for (const m of planner.members) allIds.add(m.id);
    for (const task of planner.tasks) {
      for (const id of task.assigned_to ?? []) allIds.add(id);
    }
    const people = [...allIds]
      .map((id) => memberById.get(id))
      .filter((m): m is (typeof planner.members)[number] => Boolean(m))
      .sort((a, b) => a.name.localeCompare(b.name));

    return people.map((person) => {
      const personTasks = planner.tasks
        .filter((t) => (t.assigned_to ?? []).includes(person.id))
        .filter((t) => t.start_date >= seasonStart && t.start_date <= seasonEnd);
      const { items: positionedTasks, rowCount } = positionLaneTasks(personTasks, seasonStart);
      const laneHeight = CARD_TOP + rowCount * CARD_HEIGHT + (rowCount - 1) * ROW_GAP + CARD_BOTTOM;
      return { person, positionedTasks, laneHeight };
    });
  }, [peopleOnlyMode, planner.members, planner.tasks, seasonStart, seasonEnd]);

  const labelWidth = TEAM_LABEL_WIDTH;

  const peopleByTeam = useMemo(() => {
    if (!showPeople) return new Map<string, typeof planner.members>();
    const memberById = new Map(planner.members.map((m) => [m.id, m]));
    const result = new Map<string, typeof planner.members>();
    for (const team of planner.teams) {
      const ids = new Set(
        planner.members.filter((m) => m.teams.includes(team.id)).map((m) => m.id)
      );
      for (const task of planner.tasks) {
        if (task.teams.includes(team.id)) {
          for (const id of task.assigned_to ?? []) ids.add(id);
        }
      }
      result.set(
        team.id,
        [...ids]
          .map((id) => memberById.get(id))
          .filter((m): m is (typeof planner.members)[number] => Boolean(m))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    return result;
  }, [showPeople, planner.teams, planner.tasks, planner.members]);

  const taskColorMap = useMemo(() => {
    const map = new Map<string, { bg: string; fg: string }>();
    for (const { team, positionedTasks } of laneData) {
      for (const pt of positionedTasks) {
        map.set(`${team.id}:${pt.task.id}`, teamColorAt(team, pt.row, planner.colors));
      }
    }
    return map;
  }, [laneData, planner.colors]);

  const breakSpans = useMemo(() => {
    return planner.breaks
      .map((schoolBreak) => {
        const start = String(schoolBreak.start_date).slice(0, 10);
        const end = String(schoolBreak.end_date).slice(0, 10);
        const clippedStart = start < seasonStart ? seasonStart : start;
        const clippedEnd = end > seasonEnd ? seasonEnd : end;
        if (clippedEnd < clippedStart) return null;

        const startOffset = Math.max(0, dateDiff(clippedStart, seasonStart));
        const endOffset = Math.max(startOffset, dateDiff(clippedEnd, seasonStart));
        return {
          id: schoolBreak.id,
          name: schoolBreak.name,
          startOffset,
          span: endOffset - startOffset + 1,
        };
      })
      .filter((value): value is { id: string; name: string; startOffset: number; span: number } => Boolean(value));
  }, [planner.breaks, seasonStart, seasonEnd]);

  const eventSpans = useMemo(() => {
    return planner.events
      .map((item) => {
        const start = String(item.start_date).slice(0, 10);
        const end = String(item.end_date).slice(0, 10);
        const clippedStart = start < seasonStart ? seasonStart : start;
        const clippedEnd = end > seasonEnd ? seasonEnd : end;
        if (clippedEnd < clippedStart) return null;

        const startOffset = Math.max(0, dateDiff(clippedStart, seasonStart));
        const endOffset = Math.max(startOffset, dateDiff(clippedEnd, seasonStart));
        return {
          id: item.id,
          name: item.name,
          startOffset,
          span: endOffset - startOffset + 1,
          isSingleDay: endOffset - startOffset + 1 === 1,
        };
      })
      .filter(
        (value): value is { id: string; name: string; startOffset: number; span: number; isSingleDay: boolean } =>
          Boolean(value)
      );
  }, [planner.events, seasonStart, seasonEnd]);

  const travelSpans = useMemo(() => {
    const values: Array<{
      id: string;
      label: string;
      startOffset: number;
      span: number;
      isSingleDay: boolean;
    }> = [];
    planner.events.forEach((item) => {
      const travelItems = item.travel ?? [];
      if (travelItems.length > 0) {
        travelItems.forEach((travelItem, index) => {
          const travelDate = String(travelItem.date).slice(0, 10);
          if (travelDate < seasonStart || travelDate > seasonEnd) return;
          const startOffset = Math.max(0, dateDiff(travelDate, seasonStart));
          values.push({
            id: `${item.id}-travel-${index}`,
            label: travelItem.label || "Travel",
            startOffset,
            span: 1,
            isSingleDay: true,
          });
        });
        return;
      }

      const legacyTravelDays = (item as unknown as { travel_days?: string[] }).travel_days ?? [];
      legacyTravelDays.forEach((travelDateRaw, index) => {
        const travelDate = String(travelDateRaw).slice(0, 10);
        if (travelDate < seasonStart || travelDate > seasonEnd) return;
        const startOffset = Math.max(0, dateDiff(travelDate, seasonStart));
        values.push({
          id: `${item.id}-travel-${index}`,
          label: "Travel",
          startOffset,
          span: 1,
          isSingleDay: true,
        });
      });
    });
    return values;
  }, [planner.events, seasonStart, seasonEnd]);

  const onDragStart = (ev: React.DragEvent<HTMLDivElement>, taskId: string, teamId: string, taskStartOffset: number) => {
    if (resizeStateRef.current) {
      ev.preventDefault();
      return;
    }
    const copyMode = ev.altKey;
    const cardRect = ev.currentTarget.getBoundingClientRect();
    const mouseInCard = ev.clientX - cardRect.left;
    let grabDayOffset = 0;
    if (Number.isFinite(mouseInCard) && mouseInCard > 0) {
      let accumulated = 0;
      for (let i = taskStartOffset; i < dayWidths.length; i++) {
        accumulated += dayWidths[i];
        if (accumulated > mouseInCard) break;
        grabDayOffset++;
      }
    }
    ev.dataTransfer.setData("text/plain", taskId);
    ev.dataTransfer.setData("task_id", taskId);
    ev.dataTransfer.setData("source_team_id", teamId);
    ev.dataTransfer.setData("copy_mode", copyMode ? "1" : "0");
    ev.dataTransfer.setData("grab_day_offset", String(grabDayOffset));
    ev.dataTransfer.effectAllowed = "copyMove";
    const taskKey = `${teamId}:${taskId}`;
    dragTaskKeyRef.current = taskKey;
    const pointer = pointerStateRef.current;
    if (pointer?.key === taskKey) {
      pointerStateRef.current = { ...pointer, moved: true };
    }
    if (copyMode) {
      ev.dataTransfer.dropEffect = "copy";
    }
    setIsDragging(true);
  };

  const onDragEnd = () => {
    dragTaskKeyRef.current = null;
    suppressClickUntilRef.current = Date.now() + 200;
    pointerStateRef.current = null;
    setIsDragging(false);
  };

  const onDrop = (ev: React.DragEvent<HTMLDivElement>, date: string, targetTeamId: string) => {
    const taskId = ev.dataTransfer.getData("task_id");
    const sourceTeamId = ev.dataTransfer.getData("source_team_id");
    const copyToTeam = ev.altKey || ev.dataTransfer.getData("copy_mode") === "1";
    const grabOffset = parseInt(ev.dataTransfer.getData("grab_day_offset"), 10) || 0;
    const dropDayIndex = days.findIndex((d) => d.date === date);
    const startDate = dateAtOffset(dropDayIndex - grabOffset);
    const task = planner.tasks.find((item) => item.id === taskId);
    if (!task) return;
    dragTaskKeyRef.current = null;
    setIsDragging(false);
    onMoveTask(task, startDate, sourceTeamId, targetTeamId, copyToTeam);
  };

  const onLaneDragOver = (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = ev.altKey ? "copy" : "move";
  };

  const dateAtOffset = (offset: number): string => {
    const clamped = Math.max(0, Math.min(days.length - 1, offset));
    return days[clamped]?.date ?? seasonStart;
  };

  const computeHoursForRange = (startDate: string, endDate: string): number => {
    const defaults = planner.practices.default_hours_per_day ?? {};
    const overrides = new Map<string, number>();
    (planner.practices.overrides ?? []).forEach((item) => {
      overrides.set(String(item.date).slice(0, 10), Number(item.hours ?? 0));
    });

    const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    let cursor = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    let total = 0;
    while (cursor <= end) {
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, "0");
      const dd = String(cursor.getDate()).padStart(2, "0");
      const dayKey = `${yyyy}-${mm}-${dd}`;

      if (overrides.has(dayKey)) {
        total += Number(overrides.get(dayKey) ?? 0);
      } else {
        total += Number(defaults[weekdayKeys[cursor.getDay()]] ?? 0);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return Math.max(0, total);
  };

  const finishResize = (clientX: number) => {
    const state = resizeStateRef.current;
    if (!state) return;

    const newEdgePixel = state.originalEdgePixel + (clientX - state.startClientX);
    const hoveredDay = state.side === "right"
      ? dayIndexAtPixelX(Math.max(0, newEdgePixel - 1))
      : dayIndexAtPixelX(Math.max(0, newEdgePixel));
    let newStartOffset = state.originalStartOffset;
    let newEndOffset = state.originalEndOffset;

    if (state.side === "left") {
      newStartOffset = Math.max(0, Math.min(hoveredDay, newEndOffset));
    } else {
      newEndOffset = Math.min(days.length - 1, Math.max(hoveredDay, newStartOffset));
    }

    const startDate = dateAtOffset(newStartOffset);
    const endDate = dateAtOffset(newEndOffset);
    const estHours = computeHoursForRange(startDate, endDate);
    onResizeTask(state.task, startDate, endDate, estHours);
    resizeStateRef.current = null;
  };

  const onResizeHandleMouseDown = (
    ev: React.MouseEvent<HTMLDivElement>,
    task: TaskItem,
    side: "left" | "right",
    teamId: string,
    startOffset: number,
    endOffset: number
  ) => {
    ev.preventDefault();
    ev.stopPropagation();
    const originalEdgePixel = side === "right"
      ? cumulativeOffsets[endOffset + 1] ?? cumulativeOffsets[cumulativeOffsets.length - 1]
      : cumulativeOffsets[startOffset] ?? 0;
    resizeStateRef.current = {
      task,
      side,
      startClientX: ev.clientX,
      originalEdgePixel,
      originalStartOffset: startOffset,
      originalEndOffset: endOffset,
    };
    document.body.style.cursor = "ew-resize";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      if (moveEvent.buttons === 0) {
        handleMouseUp(moveEvent);
        return;
      }
      const newEdgePixel = state.originalEdgePixel + (moveEvent.clientX - state.startClientX);
      const hoveredDay = state.side === "right"
        ? dayIndexAtPixelX(Math.max(0, newEdgePixel - 1))
        : dayIndexAtPixelX(Math.max(0, newEdgePixel));
      let newStartOffset = state.originalStartOffset;
      let newEndOffset = state.originalEndOffset;
      if (state.side === "left") {
        newStartOffset = Math.max(0, Math.min(hoveredDay, newEndOffset));
      } else {
        newEndOffset = Math.min(days.length - 1, Math.max(hoveredDay, newStartOffset));
      }
      setResizePreview({
        taskKey: `${teamId}:${state.task.id}`,
        startOffset: newStartOffset,
        endOffset: newEndOffset,
      });
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      finishResize(upEvent.clientX);
      setResizePreview(null);
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const teamById = useMemo(
    () => new Map(planner.teams.map((t) => [t.id, t])),
    [planner.teams]
  );

  const renderTaskCard = (
    task: TaskItem,
    teamId: string,
    startOffset: number,
    span: number,
    row: number,
    fillColor: { bg: string; fg: string }
  ) => {
    const team = teamById.get(teamId);
    const taskKey = `${teamId}:${task.id}`;
    const isResizingThis = resizePreview?.taskKey === taskKey;
    const effectiveStartOffset = isResizingThis ? resizePreview.startOffset : startOffset;
    const effectiveSpan = isResizingThis
      ? resizePreview.endOffset - resizePreview.startOffset + 1
      : span;
    const isSelected =
      selectedTaskPlacement?.taskId === task.id && selectedTaskPlacement.teamId === teamId;
    const isRenaming = renamingTaskId === task.id;
    const assignedNames = (task.assigned_to ?? [])
      .map((studentId) => planner.members.find((member) => member.id === studentId)?.name)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right));
    const inTaskTeamMembers = planner.members
      .filter((member) => member.teams.some((tid) => task.teams.includes(tid)))
      .sort((left, right) => left.name.localeCompare(right.name));
    const inTaskTeamIds = new Set(inTaskTeamMembers.map((member) => member.id));
    const otherMembers = planner.members
      .filter((member) => !inTaskTeamIds.has(member.id))
      .sort((left, right) => left.name.localeCompare(right.name));
    const priority = task.priority ?? "need";
    const priorityClass =
      priority === "urgent"
        ? "task-priority-urgent"
        : priority === "want"
          ? "task-priority-want"
          : "task-priority-need";

    return (
      <DropdownMenu.Root
        key={`${teamId}-${task.id}`}
        modal={false}
        open={openMenuKey === taskKey && !isRenaming}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            if (menuOpenRequestKeyRef.current === taskKey) {
              setOpenMenuKey(taskKey);
            }
            menuOpenRequestKeyRef.current = null;
            return;
          }
          menuOpenRequestKeyRef.current = null;
          setOpenMenuKey(null);
          setMenuAnchorPos(null);
        }}
      >
        <DropdownMenu.Trigger asChild>
          <span
            className="task-menu-anchor"
            aria-hidden="true"
            style={openMenuKey === taskKey && menuAnchorPos ? menuAnchorPos : undefined}
          />
        </DropdownMenu.Trigger>
        <div
          className={`task-card ${priorityClass} ${task.completed ? "completed" : ""} ${isSelected ? "selected" : ""} ${isDragging && dragTaskKeyRef.current !== taskKey ? "drag-passive" : ""}`}
          draggable={!readOnly && !isRenaming && !resizePreview}
          onDragStart={(ev) => onDragStart(ev, task.id, teamId, startOffset)}
          onDragEnd={onDragEnd}
          onMouseDown={(ev) => {
            ev.stopPropagation();
            if (ev.button === 2) {
              onSelectTask(task.id, teamId);
              if (!readOnly && !isRenaming) {
                setMenuAnchorPos(anchorPosFromEvent(ev));
                menuOpenRequestKeyRef.current = taskKey;
                setOpenMenuKey(taskKey);
              }
              return;
            }
            if (ev.button !== 0) {
              return;
            }
            pointerStateRef.current = {
              key: taskKey,
              x: ev.clientX,
              y: ev.clientY,
              moved: false,
            };
          }}
          onMouseMove={(ev) => {
            const pointer = pointerStateRef.current;
            if (!pointer || pointer.key !== taskKey) {
              return;
            }
            const deltaX = Math.abs(ev.clientX - pointer.x);
            const deltaY = Math.abs(ev.clientY - pointer.y);
            if (deltaX >= 1 || deltaY >= 1) {
              pointerStateRef.current = { ...pointer, moved: true };
            }
          }}
          onMouseUp={(ev) => {
            ev.stopPropagation();
            if (ev.button !== 0) {
              return;
            }
            if (dragTaskKeyRef.current === taskKey) {
              pointerStateRef.current = null;
              return;
            }
            const pointer = pointerStateRef.current;
            if (!pointer || pointer.key !== taskKey) {
              pointerStateRef.current = null;
              return;
            }
            if (pointer.moved) {
              pointerStateRef.current = null;
              return;
            }
            pointerStateRef.current = null;
            onSelectTask(task.id, teamId);
            if (!readOnly && !isRenaming) {
              setMenuAnchorPos(anchorPosFromEvent(ev));
              menuOpenRequestKeyRef.current = taskKey;
              setOpenMenuKey(taskKey);
            }
            suppressClickUntilRef.current = Date.now() + 120;
          }}
          onClick={(ev) => {
            ev.stopPropagation();
            if (Date.now() < suppressClickUntilRef.current) {
              return;
            }
            if (dragTaskKeyRef.current === taskKey) {
              dragTaskKeyRef.current = null;
              return;
            }
            if (
              pointerStateRef.current?.key !== taskKey ||
              pointerStateRef.current.moved
            ) {
              pointerStateRef.current = null;
              return;
            }
            pointerStateRef.current = null;
            onSelectTask(task.id, teamId);
            if (!readOnly && !isRenaming) {
              setMenuAnchorPos(anchorPosFromEvent(ev));
              menuOpenRequestKeyRef.current = taskKey;
              setOpenMenuKey(taskKey);
            }
          }}
          onDoubleClick={(ev) => {
            ev.stopPropagation();
            if (readOnly) return;
            setOpenMenuKey(null);
            onSelectTask(task.id, teamId);
            onStartRenameTask(task, teamId);
          }}
          onContextMenu={(ev) => {
            ev.preventDefault();
          }}
          title={`${task.title}\nAssigned: ${assignedNames.join(", ")}`}
          style={{
            top: CARD_TOP + row * (CARD_HEIGHT + ROW_GAP),
            left: pixelLeftForDay(effectiveStartOffset) + 2,
            width: pixelWidthForSpan(effectiveStartOffset, effectiveSpan) - 4,
            backgroundColor: fillColor.bg,
            color: fillColor.fg
          }}
        >
          {!readOnly && (
            <div
              className="task-resize-handle left"
              onClick={(ev) => ev.stopPropagation()}
              onMouseDown={(ev) =>
                onResizeHandleMouseDown(ev, task, "left", teamId, startOffset, startOffset + span - 1)
              }
            />
          )}
          {isRenaming ? (
            <input
              className="task-title-input"
              autoFocus
              value={renameDraft}
              onChange={(ev) => onRenameDraftChange(ev.target.value)}
              onClick={(ev) => ev.stopPropagation()}
              onKeyDown={(ev) => {
                ev.stopPropagation();
                if (ev.key === "Enter") {
                  ev.preventDefault();
                  onCommitRename();
                }
                if (ev.key === "Escape") {
                  ev.preventDefault();
                  onCancelRename();
                }
              }}
              onBlur={() => onCommitRename()}
            />
          ) : (
            <span>{task.title}</span>
          )}
          {!readOnly && (
            <div
              className="task-resize-handle right"
              onClick={(ev) => ev.stopPropagation()}
              onMouseDown={(ev) =>
                onResizeHandleMouseDown(ev, task, "right", teamId, startOffset, startOffset + span - 1)
              }
            />
          )}
        </div>
        {!isRenaming && (
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="task-menu" sideOffset={6} align="start">
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className="task-menu-item">
                  <span className="task-menu-icon"><Users size={14} /></span>
                  <span style={{ flex: 1 }}>Assign To</span>
                  <span className="task-menu-icon"><ChevronRight size={14} /></span>
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className="task-menu" sideOffset={4} alignOffset={-4}>
                    {inTaskTeamMembers.map((member) => {
                      const assigned = (task.assigned_to ?? []).includes(member.id);
                      return (
                        <DropdownMenu.Item
                          key={`${task.id}-assign-${member.id}`}
                          className="task-menu-item"
                          onSelect={(event) => {
                            event.preventDefault();
                            onToggleTaskAssignee(task, member.id);
                          }}
                        >
                          <span className="task-menu-icon">{assigned && <Check size={14} />}</span>
                          {member.name}
                        </DropdownMenu.Item>
                      );
                    })}
                    {inTaskTeamMembers.length > 0 && otherMembers.length > 0 && (
                      <DropdownMenu.Separator className="task-menu-separator" />
                    )}
                    {otherMembers.map((member) => {
                      const assigned = (task.assigned_to ?? []).includes(member.id);
                      return (
                        <DropdownMenu.Item
                          key={`${task.id}-assign-${member.id}`}
                          className="task-menu-item"
                          onSelect={(event) => {
                            event.preventDefault();
                            onToggleTaskAssignee(task, member.id);
                          }}
                        >
                          <span className="task-menu-icon">{assigned && <Check size={14} />}</span>
                          {member.name}
                        </DropdownMenu.Item>
                      );
                    })}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className="task-menu-item">
                  <span className="task-menu-icon"><Flag size={14} /></span>
                  <span style={{ flex: 1 }}>Priority</span>
                  <span className="task-menu-icon"><ChevronRight size={14} /></span>
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className="task-menu" sideOffset={4} alignOffset={-4}>
                    {(["urgent", "need", "want"] as const).map((p) => (
                      <DropdownMenu.Item
                        key={`${task.id}-priority-${p}`}
                        className="task-menu-item"
                        onSelect={(event) => {
                          event.preventDefault();
                          onSetTaskPriority(task, p);
                        }}
                      >
                        <span className="task-menu-icon">{(task.priority ?? "need") === p && <Check size={14} />}</span>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
              <DropdownMenu.Item
                className="task-menu-item"
                onSelect={() => {
                  setOpenMenuKey(null);
                  onToggleTaskComplete(task);
                }}
              >
                <span className="task-menu-icon">{task.completed && <Check size={14} />}</span>
                Completed
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="task-menu-item danger"
                onSelect={() => {
                  setOpenMenuKey(null);
                  onDeleteTask(task, team?.id ?? teamId);
                }}
              >
                <span className="task-menu-icon"><Trash2 size={14} /></span>
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        )}
      </DropdownMenu.Root>
    );
  };

  return (
    <div
      className={`board-wrap ${peopleOnlyMode ? "people-only-mode" : showPeople ? "people-mode" : ""}`}
      style={{ "--day-width": `${dayWidth}px`, "--label-width": `${labelWidth}px` } as React.CSSProperties}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest(".task-card") || target.closest(".task-menu") || target.closest(".task-title-input") || target.closest(".assignment-indicator")) {
          return;
        }
        onClearSelection();
        setOpenMenuKey(null);
      }}
    >
      <div className="timeline-top-row">
        <div className="timeline-corner">
          <img src={logo} alt="Taskbeard logo" className="board-logo" />
        </div>
        <div className="timeline-header-wrap" style={{ width: totalWidth }}>
          <div className="timeline-months" style={{ width: totalWidth, gridTemplateColumns: dayColumns }}>
            {monthSpans.map((month) => (
              <div
                key={month.key}
                className="month-cell"
                style={{ gridColumn: `span ${month.spanDays}` }}
              >
                {month.label}
              </div>
            ))}
          </div>
          <div className="timeline-header" style={{ width: totalWidth, gridTemplateColumns: dayColumns }}>
            {days.map((day, i) => (
              <div
                key={day.date}
                className={`day-cell ${inactiveDateSet.has(day.date) ? "inactive" : ""} ${breakDateSet.has(day.date) ? "break" : ""} ${practiceOverrideByDate.has(day.date) && !breakDateSet.has(day.date) ? "override" : ""} ${day.past ? "past" : ""} ${day.is_today ? "today" : ""}`}
                title={breakDateSet.has(day.date) ? "no practice" : practiceOverrideByDate.get(day.date)?.label ?? ((practiceHoursByDate.get(day.date) ?? 0) === 0 ? "no practice" : `${day.date}: ${Number(practiceHoursByDate.get(day.date))}h practice`)}
                style={dayWidths[i] === 0 ? { display: "none" } : undefined}
              >
                <div>{dayWidths[i] < 25 ? (SHORT_WEEKDAYS[day.weekday] ?? day.weekday.charAt(0)) : day.weekday}</div>
                <div className="day-num">{day.date.slice(8, 10)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lanes-stack" style={{ width: totalWidth + labelWidth }}>
        <div className="break-overlays" style={{ left: labelWidth, width: totalWidth }}>
          {eventSpans.map((item) => (
            <div
              key={item.id}
              className={`event-block ${item.isSingleDay ? "single-day" : ""}`}
              style={{
                left: pixelLeftForDay(item.startOffset),
                width: pixelWidthForSpan(item.startOffset, item.span),
              }}
            >
              <span>{item.name}</span>
            </div>
          ))}

          {travelSpans.map((item) => (
            <div
              key={item.id}
              className={`travel-block ${item.isSingleDay ? "single-day" : ""}`}
              style={{
                left: pixelLeftForDay(item.startOffset),
                width: pixelWidthForSpan(item.startOffset, item.span),
              }}
            >
              <span>{item.label}</span>
            </div>
          ))}

          {breakSpans.map((item) => (
            <div
              key={item.id}
              className="break-block"
              style={{
                left: pixelLeftForDay(item.startOffset),
                width: pixelWidthForSpan(item.startOffset, item.span),
              }}
            >
              <span>{item.name}</span>
            </div>
          ))}
        </div>

        {todayIndex >= 0 && (
          <div
            className="today-overlay"
            style={{
              left: labelWidth + pixelLeftForDay(todayIndex),
              width: dayWidths[todayIndex] ?? dayWidth,
            }}
          />
        )}

        {!peopleOnlyMode && laneData.map(({ team, positionedTasks, laneHeight }) => {
          const people = showPeople ? (peopleByTeam.get(team.id) ?? []) : [];
          const peopleHeight = people.length * PERSON_ROW_HEIGHT;
          const groupHeight = showPeople ? laneHeight + peopleHeight : laneHeight;

          const taskGridContent = (
            <>
              {days.map((day, i) => (
                <div
                  key={`${team.id}-${day.date}`}
                  className={`lane-day ${inactiveDateSet.has(day.date) ? "inactive" : ""} ${breakDateSet.has(day.date) ? "break" : ""} ${practiceOverrideByDate.has(day.date) && !breakDateSet.has(day.date) ? "override" : ""} ${day.past ? "past" : ""} ${day.is_today ? "today" : ""}`}
                  onDragOver={readOnly ? undefined : onLaneDragOver}
                  onDrop={readOnly ? undefined : (ev) => onDrop(ev, day.date, team.id)}
                  onDoubleClick={readOnly ? undefined : () => onCreateTaskAt(day.date, team.id)}
                  title={breakDateSet.has(day.date) ? "no practice" : practiceOverrideByDate.get(day.date)?.label ?? ((practiceHoursByDate.get(day.date) ?? 0) === 0 ? "no practice" : `${day.date}: ${Number(practiceHoursByDate.get(day.date))}h practice`)}
                  style={dayWidths[i] === 0 ? { minHeight: laneHeight, display: "none" } : { minHeight: laneHeight }}
                />
              ))}

              {positionedTasks.map(({ task, startOffset, span, row }) =>
                renderTaskCard(task, team.id, startOffset, span, row, teamColorAt(team, row, planner.colors))
              )}
            </>
          );

          const teamTasks = showPeople
            ? planner.tasks
                .filter((t) => t.teams.includes(team.id))
                .filter((t) => t.start_date >= seasonStart && t.start_date <= seasonEnd)
            : [];

          if (showPeople && !peopleOnlyMode) {
            const teamColor = teamDefaultColor(team, planner.colors).bg;
            return (
              <div key={team.id} className="lane-group">
                <div className="lane-task-section">
                  <div
                    className="lane-label"
                    style={{ borderLeftColor: teamColor, minHeight: laneHeight }}
                  >
                    {team.name}
                  </div>
                  <div className="lane-grid" style={{ width: totalWidth, minHeight: laneHeight, gridTemplateColumns: dayColumns }}>
                    {taskGridContent}
                  </div>
                </div>
                <div className="lane-people">
                  {people.map((person) => {
                    const personTasks = teamTasks.filter((t) =>
                      (t.assigned_to ?? []).includes(person.id)
                    );
                    return (
                      <div key={person.id} className="person-row">
                        <div className="person-label-area">
                          <div className="person-indent" style={{ borderLeftColor: teamColor }} />
                          <div className="person-label">{person.name}</div>
                        </div>
                        <div
                            className="person-grid"
                            style={{ width: totalWidth, gridTemplateColumns: dayColumns }}
                          >
                            {days.map((day, i) => (
                              <div
                                key={`${team.id}-${person.id}-${day.date}`}
                                className={`person-day ${inactiveDateSet.has(day.date) ? "inactive" : ""} ${breakDateSet.has(day.date) ? "break" : ""} ${day.past ? "past" : ""} ${day.is_today ? "today" : ""}`}
                                style={dayWidths[i] === 0 ? { display: "none" } : undefined}
                              />
                            ))}
                            {personTasks.map((task) => {
                              const startOffset = Math.max(0, dateDiff(task.start_date, seasonStart));
                              const endOffset = Math.max(startOffset, dateDiff(task.end_date, seasonStart));
                              const span = endOffset - startOffset + 1;
                              const color = taskColorMap.get(`${team.id}:${task.id}`) ?? { bg: "#6b7280", fg: "#fff" };
                              const indicatorKey = `assign:${team.id}:${task.id}:${person.id}`;
                              const isIndicatorSelected =
                                selectedAssignment?.taskId === task.id &&
                                selectedAssignment?.memberId === person.id;

                              return (
                                <DropdownMenu.Root
                                  key={indicatorKey}
                                  modal={false}
                                  open={openMenuKey === indicatorKey}
                                  onOpenChange={(nextOpen) => {
                                    if (nextOpen) {
                                      if (menuOpenRequestKeyRef.current === indicatorKey) {
                                        setOpenMenuKey(indicatorKey);
                                      }
                                      menuOpenRequestKeyRef.current = null;
                                      return;
                                    }
                                    menuOpenRequestKeyRef.current = null;
                                    setOpenMenuKey(null);
                                    setMenuAnchorPos(null);
                                  }}
                                >
                                  <DropdownMenu.Trigger asChild>
                                    <span
                                      className="task-menu-anchor"
                                      aria-hidden="true"
                                      style={openMenuKey === indicatorKey && menuAnchorPos ? menuAnchorPos : undefined}
                                    />
                                  </DropdownMenu.Trigger>
                                  <div
                                    className={`assignment-indicator ${task.completed ? "completed" : ""} ${isIndicatorSelected ? "selected" : ""}`}
                                    title={task.title}
                                    style={{
                                      left: pixelLeftForDay(startOffset) + 2,
                                      width: pixelWidthForSpan(startOffset, span) - 4,
                                      backgroundColor: color.bg,
                                    }}
                                    onMouseDown={(ev) => {
                                      ev.stopPropagation();
                                      if (ev.button === 2) {
                                        onSelectAssignment(task.id, person.id);
                                        setMenuAnchorPos(anchorPosFromEvent(ev));
                                        menuOpenRequestKeyRef.current = indicatorKey;
                                        setOpenMenuKey(indicatorKey);
                                        return;
                                      }
                                      if (ev.button === 0) {
                                        onSelectAssignment(task.id, person.id);
                                      }
                                    }}
                                    onClick={(ev) => ev.stopPropagation()}
                                    onContextMenu={(ev) => ev.preventDefault()}
                                  />
                                  <DropdownMenu.Portal>
                                    <DropdownMenu.Content className="task-menu" sideOffset={4} align="start">
                                      <DropdownMenu.Item
                                        className="task-menu-item danger"
                                        onSelect={() => {
                                          setOpenMenuKey(null);
                                          onToggleTaskAssignee(task, person.id);
                                        }}
                                      >
                                        <span className="task-menu-icon"><UserMinus size={14} /></span>
                                        Unassign
                                      </DropdownMenu.Item>
                                    </DropdownMenu.Content>
                                  </DropdownMenu.Portal>
                                </DropdownMenu.Root>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
          }

          return (
            <div key={team.id} className="lane-row">
              <div
                className="lane-label"
                style={{ borderLeftColor: teamDefaultColor(team, planner.colors).bg, minHeight: laneHeight }}
              >
                {team.name}
              </div>
              <div className="lane-grid" style={{ width: totalWidth, minHeight: laneHeight, gridTemplateColumns: dayColumns }}>
                {taskGridContent}
              </div>
            </div>
          );
        })}

        {peopleOnlyMode && personLaneData.map(({ person, positionedTasks, laneHeight }) => {
          const firstTeamId = person.teams[0] ?? planner.teams[0]?.id ?? "";
          return (
            <div key={person.id} className="lane-row">
              <div
                className="lane-label people-only-label"
                style={{ minHeight: laneHeight }}
              >
                {person.name}
              </div>
              <div
                className="lane-grid"
                style={{ width: totalWidth, minHeight: laneHeight, gridTemplateColumns: dayColumns }}
              >
                {days.map((day, i) => (
                  <div
                    key={`person-${person.id}-${day.date}`}
                    className={`lane-day ${inactiveDateSet.has(day.date) ? "inactive" : ""} ${breakDateSet.has(day.date) ? "break" : ""} ${practiceOverrideByDate.has(day.date) && !breakDateSet.has(day.date) ? "override" : ""} ${day.past ? "past" : ""} ${day.is_today ? "today" : ""}`}
                    onDragOver={readOnly ? undefined : onLaneDragOver}
                    onDrop={readOnly ? undefined : (ev) => {
                      const srcTeam = ev.dataTransfer.getData("source_team_id");
                      onDrop(ev, day.date, srcTeam || firstTeamId);
                    }}
                    onDoubleClick={readOnly ? undefined : () => onCreateTaskAt(day.date, firstTeamId)}
                    title={breakDateSet.has(day.date) ? "no practice" : practiceOverrideByDate.get(day.date)?.label ?? ((practiceHoursByDate.get(day.date) ?? 0) === 0 ? "no practice" : `${day.date}: ${Number(practiceHoursByDate.get(day.date))}h practice`)}
                    style={dayWidths[i] === 0 ? { minHeight: laneHeight, display: "none" } : { minHeight: laneHeight }}
                  />
                ))}
                {positionedTasks.map(({ task, startOffset, span, row }) => {
                  const taskTeam = planner.teams.find((t) => task.teams.includes(t.id));
                  const effectiveTeamId = taskTeam?.id ?? firstTeamId;
                  const fillColor = taskTeam
                    ? teamColorAt(taskTeam, row, planner.colors)
                    : { bg: "#6b7280", fg: "#fff" };
                  return renderTaskCard(task, effectiveTeamId, startOffset, span, row, fillColor);
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
