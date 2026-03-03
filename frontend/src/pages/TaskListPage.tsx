import { useEffect, useRef, useState } from "react";
import type { PlannerPayload, TaskItem } from "../services/plannerApi";
import { teamDefaultColor } from "../services/teamColors";

type EditableTaskRow = {
  task_id: string | null;
  title: string;
  priority: TaskItem["priority"];
  est_hours: string;
};

type Props = {
  planner: PlannerPayload;
  onCommitTaskRow: (
    teamId: string,
    row: { task_id: string | null; title: string; priority: TaskItem["priority"]; est_hours: number }
  ) => Promise<void>;
};

const COLUMNS = ["title", "priority", "est_hours"] as const;
type ColumnKey = (typeof COLUMNS)[number];

const blankRow = (): EditableTaskRow => ({
  task_id: null,
  title: "",
  priority: "need",
  est_hours: "",
});

function hasValue(row: EditableTaskRow): boolean {
  return row.title.trim().length > 0 || row.est_hours.trim().length > 0 || row.priority !== "need";
}

function ensureTrailingBlank(rows: EditableTaskRow[]): EditableTaskRow[] {
  if (rows.length === 0) return [blankRow()];
  const last = rows[rows.length - 1];
  return hasValue(last) ? [...rows, blankRow()] : rows;
}

function normalizeHours(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function buildRowsByTeam(planner: PlannerPayload): Record<string, EditableTaskRow[]> {
  const values: Record<string, EditableTaskRow[]> = {};
  planner.teams.forEach((team) => {
    const teamRows = planner.tasks
      .filter((task) => task.teams.includes(team.id))
      .map((task) => ({
        task_id: task.id,
        title: task.title,
        priority: task.priority ?? "need",
        est_hours: String(Number(task.est_hours ?? 0)),
      }));
    values[team.id] = ensureTrailingBlank(teamRows);
  });
  return values;
}

export function TaskListPage({ planner, onCommitTaskRow }: Props) {
  const [rowsByTeam, setRowsByTeam] = useState<Record<string, EditableTaskRow[]>>(() =>
    buildRowsByTeam(planner)
  );
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement | HTMLSelectElement>());
  const focusSnapshots = useRef(new Map<string, string>());

  useEffect(() => {
    setRowsByTeam(buildRowsByTeam(planner));
  }, [planner.tasks, planner.teams]);

  const rowsForTeam = (teamId: string): EditableTaskRow[] => {
    const rows = rowsByTeam[teamId] ?? [blankRow()];
    return ensureTrailingBlank(rows);
  };

  const updateRow = (
    teamId: string,
    rowIndex: number,
    updater: (current: EditableTaskRow) => EditableTaskRow
  ) => {
    setRowsByTeam((current) => {
      const currentRows = rowsForTeam(teamId);
      const nextRows = currentRows.map((row, index) => (index === rowIndex ? updater(row) : row));
      return {
        ...current,
        [teamId]: ensureTrailingBlank(nextRows),
      };
    });
  };

  const setRef = (
    teamId: string,
    rowIndex: number,
    column: ColumnKey,
    element: HTMLInputElement | HTMLSelectElement | null
  ) => {
    const key = `${teamId}:${rowIndex}:${column}`;
    if (!element) {
      inputRefs.current.delete(key);
      return;
    }
    inputRefs.current.set(key, element);
  };

  const focusCell = (teamId: string, rowIndex: number, column: ColumnKey) => {
    const key = `${teamId}:${rowIndex}:${column}`;
    window.setTimeout(() => {
      const element = inputRefs.current.get(key);
      if (!element) return;
      element.focus();
      if (element instanceof HTMLInputElement) {
        element.select();
      }
    }, 0);
  };

  const submitRow = async (teamId: string, rowIndex: number): Promise<boolean> => {
    const rows = rowsForTeam(teamId);
    const row = rows[rowIndex];
    if (!row) return false;
    const title = row.title.trim();
    if (!title) return false;

    setSavingTeamId(teamId);
    try {
      await onCommitTaskRow(teamId, {
        task_id: row.task_id,
        title,
        priority: row.priority,
        est_hours: normalizeHours(row.est_hours),
      });
      return true;
    } finally {
      setSavingTeamId(null);
    }
  };

  const onCellKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    teamId: string,
    rowIndex: number,
    column: ColumnKey
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      const snapshotKey = `${teamId}:${rowIndex}:${column}`;
      const previous = focusSnapshots.current.get(snapshotKey);
      if (previous !== undefined) {
        updateRow(teamId, rowIndex, (current) => ({
          ...current,
          [column]: previous,
        }));
      }
      (event.currentTarget as HTMLInputElement | HTMLSelectElement).blur();
      return;
    }

    if (event.key !== "Enter" && event.key !== "Tab") {
      return;
    }

    event.preventDefault();
    const columnIndex = COLUMNS.indexOf(column);

    void (async () => {
      const committed = await submitRow(teamId, rowIndex);
      if (!committed) return;

      if (event.key === "Enter") {
        focusCell(teamId, rowIndex + 1, column);
        return;
      }

      const nextColumnIndex = columnIndex + 1;
      if (nextColumnIndex < COLUMNS.length) {
        focusCell(teamId, rowIndex, COLUMNS[nextColumnIndex]);
      } else {
        focusCell(teamId, rowIndex + 1, COLUMNS[0]);
      }
    })();
  };

  return (
    <div className="task-list-page">
      {planner.teams.map((team) => {
        const rows = rowsForTeam(team.id);
        const teamColor = teamDefaultColor(team, planner.colors).bg;
        return (
          <section key={team.id} className="task-list-team">
            <div className="task-list-team-head">
              <span className="task-list-team-badge" style={{ backgroundColor: teamColor }} aria-hidden="true" />
              <h3>{team.name}</h3>
            </div>
            <table className="task-list-table">
              <thead>
                <tr>
                  <th>Task Name</th>
                  <th>Priority</th>
                  <th>Est Hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={`${team.id}-${row.task_id ?? `draft-${rowIndex}`}`}>
                    <td>
                      <input
                        value={row.title}
                        ref={(element) => setRef(team.id, rowIndex, "title", element)}
                        onFocus={() => {
                          focusSnapshots.current.set(`${team.id}:${rowIndex}:title`, row.title);
                        }}
                        onChange={(event) =>
                          updateRow(team.id, rowIndex, (current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => onCellKeyDown(event, team.id, rowIndex, "title")}
                        placeholder={rowIndex === rows.length - 1 ? "New task" : ""}
                        disabled={savingTeamId === team.id}
                        data-testid={`task-list-${team.id}-${rowIndex}-title`}
                      />
                    </td>
                    <td>
                      <select
                        value={row.priority}
                        ref={(element) => setRef(team.id, rowIndex, "priority", element)}
                        onFocus={() => {
                          focusSnapshots.current.set(`${team.id}:${rowIndex}:priority`, row.priority);
                        }}
                        onChange={(event) =>
                          updateRow(team.id, rowIndex, (current) => ({
                            ...current,
                            priority: event.target.value as TaskItem["priority"],
                          }))
                        }
                        onKeyDown={(event) => onCellKeyDown(event, team.id, rowIndex, "priority")}
                        disabled={savingTeamId === team.id}
                        data-testid={`task-list-${team.id}-${rowIndex}-priority`}
                      >
                        <option value="urgent">urgent</option>
                        <option value="need">need</option>
                        <option value="want">want</option>
                      </select>
                    </td>
                    <td>
                      <input
                        value={row.est_hours}
                        ref={(element) => setRef(team.id, rowIndex, "est_hours", element)}
                        onFocus={() => {
                          focusSnapshots.current.set(`${team.id}:${rowIndex}:est_hours`, row.est_hours);
                        }}
                        onChange={(event) =>
                          updateRow(team.id, rowIndex, (current) => ({
                            ...current,
                            est_hours: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => onCellKeyDown(event, team.id, rowIndex, "est_hours")}
                        placeholder="0"
                        inputMode="decimal"
                        disabled={savingTeamId === team.id}
                        data-testid={`task-list-${team.id}-${rowIndex}-est_hours`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
