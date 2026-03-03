import { useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { PlannerPayload, TaskItem } from "../services/plannerApi";
import { teamColorAt, teamDefaultColor } from "../services/teamColors";

const logo = new URL("../logo.svg", import.meta.url).href;

type SelectedTaskPlacement = {
  taskId: string;
  teamId: string;
};

type Props = {
  planner: PlannerPayload;
  onMoveTask: (
    task: TaskItem,
    startDate: string,
    sourceTeamId: string,
    targetTeamId: string,
    copyToTeam: boolean
  ) => void;
  onResizeTask: (task: TaskItem, startDate: string, endDate: string, estHours: number) => void;
  onToggleTaskComplete: (task: TaskItem) => void;
  onToggleTaskAssignee: (task: TaskItem, memberId: string) => void;
  onDeleteTask: (task: TaskItem, teamId: string) => void;
  selectedTaskPlacement: SelectedTaskPlacement | null;
  renamingTaskId: string | null;
  renameDraft: string;
  onSelectTask: (taskId: string, teamId: string) => void;
  onClearSelection: () => void;
  onStartRenameTask: (task: TaskItem, teamId: string) => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onCreateTaskAt: (startDate: string, teamId: string) => void;
};

const DAY_WIDTH = 35;
const CARD_HEIGHT = 30;
const CARD_TOP = 2;
const CARD_BOTTOM = 2;
const ROW_GAP = 1;

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
      if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
      if (a.endOffset !== b.endOffset) return a.endOffset - b.endOffset;
      return a.task.title.localeCompare(b.task.title);
    });

  const rowEndOffsets: number[] = [];
  const positioned: PositionedTask[] = [];

  intervals.forEach((interval) => {
    let rowIndex = rowEndOffsets.findIndex((endOffset) => interval.startOffset > endOffset);
    if (rowIndex === -1) {
      rowIndex = rowEndOffsets.length;
      rowEndOffsets.push(interval.endOffset);
    } else {
      rowEndOffsets[rowIndex] = interval.endOffset;
    }

    positioned.push({ ...interval, row: rowIndex });
  });

  return { items: positioned, rowCount: Math.max(rowEndOffsets.length, 1) };
}

export function TimelineGrid({
  planner,
  onMoveTask,
  onResizeTask,
  onToggleTaskComplete,
  onToggleTaskAssignee,
  onDeleteTask,
  selectedTaskPlacement,
  renamingTaskId,
  renameDraft,
  onSelectTask,
  onClearSelection,
  onStartRenameTask,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  onCreateTaskAt,
}: Props) {
  const seasonStart = planner.season.start_date;
  const seasonEnd = planner.season.end_date;
  const days = planner.dates;
  const totalWidth = days.length * DAY_WIDTH;
  const dayColumns = `repeat(${days.length}, ${DAY_WIDTH}px)`;
  const resizeStateRef = useRef<{
    task: TaskItem;
    side: "left" | "right";
    startClientX: number;
    originalStartOffset: number;
    originalEndOffset: number;
  } | null>(null);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const menuOpenRequestKeyRef = useRef<string | null>(null);
  const pointerStateRef = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null);
  const dragTaskKeyRef = useRef<string | null>(null);
  const suppressClickUntilRef = useRef(0);

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
  }, [days, planner.practices.default_hours_per_day, planner.practices.overrides]);

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
  }, [days, planner.practices.default_hours_per_day, practiceOverrideByDate]);

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

  const onDragStart = (ev: React.DragEvent<HTMLDivElement>, taskId: string, teamId: string) => {
    if (resizeStateRef.current) {
      ev.preventDefault();
      return;
    }
    const copyMode = ev.altKey;
    ev.dataTransfer.setData("text/plain", taskId);
    ev.dataTransfer.setData("task_id", taskId);
    ev.dataTransfer.setData("source_team_id", teamId);
    ev.dataTransfer.setData("copy_mode", copyMode ? "1" : "0");
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
  };

  const onDragEnd = () => {
    dragTaskKeyRef.current = null;
    suppressClickUntilRef.current = Date.now() + 200;
    pointerStateRef.current = null;
  };

  const onDrop = (ev: React.DragEvent<HTMLDivElement>, date: string, targetTeamId: string) => {
    const taskId = ev.dataTransfer.getData("task_id");
    const sourceTeamId = ev.dataTransfer.getData("source_team_id");
    const copyToTeam = ev.altKey || ev.dataTransfer.getData("copy_mode") === "1";
    const task = planner.tasks.find((item) => item.id === taskId);
    if (!task) return;
    onMoveTask(task, date, sourceTeamId, targetTeamId, copyToTeam);
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

    const deltaDays = Math.round((clientX - state.startClientX) / DAY_WIDTH);
    let newStartOffset = state.originalStartOffset;
    let newEndOffset = state.originalEndOffset;

    if (state.side === "left") {
      newStartOffset = Math.max(0, Math.min(state.originalStartOffset + deltaDays, newEndOffset));
    } else {
      newEndOffset = Math.min(days.length - 1, Math.max(state.originalEndOffset + deltaDays, newStartOffset));
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
    startOffset: number,
    endOffset: number
  ) => {
    ev.preventDefault();
    ev.stopPropagation();
    resizeStateRef.current = {
      task,
      side,
      startClientX: ev.clientX,
      originalStartOffset: startOffset,
      originalEndOffset: endOffset,
    };
    document.body.style.cursor = "ew-resize";

    const handleMouseUp = (upEvent: MouseEvent) => {
      finishResize(upEvent.clientX);
      document.body.style.cursor = "";
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      className="board-wrap"
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest(".task-card") || target.closest(".task-menu") || target.closest(".task-title-input")) {
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
            {days.map((day) => (
              <div
                key={day.date}
                className={`day-cell ${inactiveDateSet.has(day.date) ? "inactive" : ""} ${breakDateSet.has(day.date) ? "break" : ""} ${practiceOverrideByDate.has(day.date) ? "override" : ""} ${day.past ? "past" : ""} ${day.is_today ? "today" : ""}`}
                title={practiceOverrideByDate.get(day.date)?.label ?? `${day.date}: ${Number(practiceHoursByDate.get(day.date) ?? 0)}h practice`}
              >
                <div>{day.weekday}</div>
                <div className="day-num">{day.date.slice(8, 10)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lanes-stack" style={{ width: totalWidth + 170 }}>
        <div className="break-overlays" style={{ left: 170, width: totalWidth }}>
          {eventSpans.map((item) => (
            <div
              key={item.id}
              className={`event-block ${item.isSingleDay ? "single-day" : ""}`}
              style={{
                left: item.startOffset * DAY_WIDTH,
                width: item.span * DAY_WIDTH,
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
                left: item.startOffset * DAY_WIDTH,
                width: item.span * DAY_WIDTH,
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
                left: item.startOffset * DAY_WIDTH,
                width: item.span * DAY_WIDTH,
              }}
            >
              <span>{item.name}</span>
            </div>
          ))}
        </div>

        {laneData.map(({ team, positionedTasks, laneHeight }) => (
          <div key={team.id} className="lane-row">
            <div
              className="lane-label"
              style={{ borderLeftColor: teamDefaultColor(team, planner.colors).bg, minHeight: laneHeight }}
            >
              {team.name}
            </div>
            <div className="lane-grid" style={{ width: totalWidth, minHeight: laneHeight, gridTemplateColumns: dayColumns }}>
              {days.map((day) => (
                <div
                  key={`${team.id}-${day.date}`}
                  className={`lane-day ${inactiveDateSet.has(day.date) ? "inactive" : ""} ${breakDateSet.has(day.date) ? "break" : ""} ${practiceOverrideByDate.has(day.date) ? "override" : ""} ${day.past ? "past" : ""} ${day.is_today ? "today" : ""}`}
                  onDragOver={onLaneDragOver}
                  onDrop={(ev) => onDrop(ev, day.date, team.id)}
                  onDoubleClick={() => onCreateTaskAt(day.date, team.id)}
                  title={practiceOverrideByDate.get(day.date)?.label ?? `${day.date}: ${Number(practiceHoursByDate.get(day.date) ?? 0)}h practice`}
                  style={{ minHeight: laneHeight }}
                />
              ))}

              {positionedTasks.map(({ task, startOffset, span, row }) => {
                const taskKey = `${team.id}:${task.id}`;
                const isSelected =
                  selectedTaskPlacement?.taskId === task.id && selectedTaskPlacement.teamId === team.id;
                const isRenaming = renamingTaskId === task.id;
                const assignedNames = (task.assigned_to ?? [])
                  .map((studentId) => planner.members.find((member) => member.id === studentId)?.name)
                  .filter((value): value is string => Boolean(value))
                  .sort((left, right) => left.localeCompare(right));
                const inTaskTeamMembers = planner.members
                  .filter((member) => member.teams.some((teamId) => task.teams.includes(teamId)))
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
                const fillColor = teamColorAt(team, row, planner.colors);

                return (
                  <DropdownMenu.Root
                    key={`${team.id}-${task.id}`}
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
                    }}
                  >
                    <DropdownMenu.Trigger asChild>
                      <div
                        className={`task-card ${priorityClass} ${task.completed ? "completed" : ""} ${isSelected ? "selected" : ""}`}
                        draggable={!isRenaming}
                        onPointerDown={(ev) => {
                          ev.stopPropagation();
                        }}
                        onDragStart={(ev) => onDragStart(ev, task.id, team.id)}
                        onDragEnd={onDragEnd}
                        onMouseDown={(ev) => {
                          ev.stopPropagation();
                          if (ev.button === 2) {
                            onSelectTask(task.id, team.id);
                            if (!isRenaming) {
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
                          onSelectTask(task.id, team.id);
                          if (!isRenaming) {
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
                          onSelectTask(task.id, team.id);
                          if (!isRenaming) {
                            menuOpenRequestKeyRef.current = taskKey;
                            setOpenMenuKey(taskKey);
                          }
                        }}
                        onDoubleClick={(ev) => {
                          ev.stopPropagation();
                          setOpenMenuKey(null);
                          onSelectTask(task.id, team.id);
                          onStartRenameTask(task, team.id);
                        }}
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                        }}
                        title={`Assigned: ${assignedNames.join(", ")}`}
                        style={{
                          top: CARD_TOP + row * (CARD_HEIGHT + ROW_GAP),
                          left: startOffset * DAY_WIDTH + 2,
                          width: span * DAY_WIDTH - 4,
                          backgroundColor: fillColor.bg,
                          color: fillColor.fg
                        }}
                      >
                        <div
                          className="task-resize-handle left"
                          onClick={(ev) => ev.stopPropagation()}
                          onMouseDown={(ev) =>
                            onResizeHandleMouseDown(ev, task, "left", startOffset, startOffset + span - 1)
                          }
                        />
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
                        <div
                          className="task-resize-handle right"
                          onClick={(ev) => ev.stopPropagation()}
                          onMouseDown={(ev) =>
                            onResizeHandleMouseDown(ev, task, "right", startOffset, startOffset + span - 1)
                          }
                        />
                      </div>
                    </DropdownMenu.Trigger>
                    {!isRenaming && (
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="task-menu" sideOffset={6} align="start">
                          <DropdownMenu.Sub>
                            <DropdownMenu.SubTrigger className="task-menu-item">
                              Assign To ▸
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
                                      {assigned ? "✓ " : "  "}
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
                                      {assigned ? "✓ " : "  "}
                                      {member.name}
                                    </DropdownMenu.Item>
                                  );
                                })}
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
                            {task.completed ? "✓" : ""} Complete
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="task-menu-item danger"
                            onSelect={() => {
                              setOpenMenuKey(null);
                              onDeleteTask(task, team.id);
                            }}
                          >
                            × Delete
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    )}
                  </DropdownMenu.Root>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
