import { useMemo } from "react";
import type { PlannerPayload, TaskItem } from "../services/plannerApi";

const DAY_WIDTH = 35.2;

type Props = {
  planner: PlannerPayload;
};

function dateDiff(a: string, b: string): number {
  const aMs = new Date(`${a}T00:00:00`).getTime();
  const bMs = new Date(`${b}T00:00:00`).getTime();
  return Math.round((aMs - bMs) / (24 * 60 * 60 * 1000));
}

function taskSpan(task: TaskItem, seasonStart: string, seasonEnd: string): { startOffset: number; span: number } | null {
  const start = task.start_date;
  const end = task.end_date;
  const clippedStart = start < seasonStart ? seasonStart : start;
  const clippedEnd = end > seasonEnd ? seasonEnd : end;
  if (clippedEnd < clippedStart) {
    return null;
  }

  const startOffset = Math.max(0, dateDiff(clippedStart, seasonStart));
  const endOffset = Math.max(startOffset, dateDiff(clippedEnd, seasonStart));
  return {
    startOffset,
    span: endOffset - startOffset + 1,
  };
}

export function TeamPage({ planner }: Props) {
  const seasonStart = planner.season.start_date;
  const seasonEnd = planner.season.end_date;
  const totalWidth = planner.dates.length * DAY_WIDTH;

  const monthSpans = useMemo(() => {
    const spans: Array<{ key: string; label: string; spanDays: number }> = [];
    if (planner.dates.length === 0) {
      return spans;
    }

    let currentKey = "";
    let currentLabel = "";
    let currentSpan = 0;

    planner.dates.forEach((day, index) => {
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
  }, [planner.dates]);

  const membersById = useMemo(() => {
    const map = new Map<string, PlannerPayload["members"][number]>();
    planner.members.forEach((member) => map.set(member.id, member));
    return map;
  }, [planner.members]);

  const grouped = useMemo(() => {
    return planner.teams.map((team) => {
      const tasksForTeam = planner.tasks.filter((task) => task.teams.includes(team.id));
      const tasksByMember = new Map<string, TaskItem[]>();

      tasksForTeam.forEach((task) => {
        (task.assigned_to ?? []).forEach((memberId) => {
          if (!membersById.has(memberId)) {
            return;
          }
          const existing = tasksByMember.get(memberId) ?? [];
          existing.push(task);
          tasksByMember.set(memberId, existing);
        });
      });

      const memberRows = Array.from(tasksByMember.entries())
        .map(([memberId, tasks]) => ({ member: membersById.get(memberId)!, tasks }))
        .sort((left, right) => left.member.name.localeCompare(right.member.name));

      return { team, memberRows };
    });
  }, [planner.tasks, planner.teams, membersById]);

  return (
    <div className="team-page">
      <div className="team-header-wrap" style={{ width: totalWidth }}>
        <div className="team-months">
          {monthSpans.map((month) => (
            <div key={month.key} className="month-cell" style={{ width: month.spanDays * DAY_WIDTH }}>
              {month.label}
            </div>
          ))}
        </div>
        <div className="team-days" style={{ width: totalWidth }}>
          {planner.dates.map((day) => (
            <div key={day.date} className="team-day-cell" title={day.date}>
              <div>{day.weekday}</div>
              <div className="team-day-num">{day.date.slice(8, 10)}</div>
            </div>
          ))}
        </div>
      </div>

      {grouped.map(({ team, memberRows }) => (
        <div key={team.id} className="team-group">
          <div className="team-group-label" style={{ borderLeftColor: team.color }}>
            {team.name}
          </div>

          {memberRows.map(({ member, tasks }) => (
            <div key={`${team.id}-${member.id}`} className="team-member-row">
              <div className="team-member-name">{member.name}</div>
              <div className="team-member-grid" style={{ width: totalWidth }}>
                {planner.dates.map((day) => (
                  <div key={`${team.id}-${member.id}-${day.date}`} className="team-member-day" />
                ))}

                {tasks.map((task) => {
                  const span = taskSpan(task, seasonStart, seasonEnd);
                  if (!span) {
                    return null;
                  }
                  return (
                    <div
                      key={`${team.id}-${member.id}-${task.id}`}
                      className="team-task-fill"
                      title={task.title}
                      style={{
                        left: span.startOffset * DAY_WIDTH + 2,
                        width: span.span * DAY_WIDTH - 4,
                        backgroundColor: team.color,
                      }}
                    >
                      {task.title}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {memberRows.length === 0 && <div className="muted">No assigned members</div>}
        </div>
      ))}
    </div>
  );
}
