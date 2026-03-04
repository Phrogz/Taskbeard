import { useMemo } from "react";
import { TimelineGrid } from "../components/TimelineGrid";
import type { PlannerPayload, TaskItem } from "../services/plannerApi";
import { teamDefaultColor } from "../services/teamColors";

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
};

export function BoardPage({
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
}: Props) {

  const warningByTask = useMemo(() => {
    const map = new Map<string, string[]>();
    planner.dependency_warnings.forEach((warning) => {
      const list = map.get(warning.task_id) ?? [];
      list.push(warning.dependency_id ? `${warning.dependency_id}: ${warning.message}` : warning.message);
      map.set(warning.task_id, list);
    });
    return map;
  }, [planner.dependency_warnings]);

  return (
    <div className="board-page">
      <div className="board-main">
        <TimelineGrid
          planner={planner}
          showTeams={showTeams}
          showPeople={showPeople}
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
          onClearSelection={onClearSelection}
          onStartRenameTask={onStartRenameTask}
          onRenameDraftChange={onRenameDraftChange}
          onCommitRename={onCommitRename}
          onCancelRename={onCancelRename}
          onCreateTaskAt={onCreateTaskAt}
          dayWidth={dayWidth}
        />
      </div>
      <section className="warnings-bar">
        <h3 className="warnings-heading">Warnings</h3>
        {planner.tasks
          .filter((task) => warningByTask.has(task.id))
          .map((task) => {
            const team = planner.teams.find((t) => task.teams.includes(t.id));
            const color = team ? teamDefaultColor(team, planner.colors) : { bg: "#1e293b", fg: "#fbbf24" };
            return (
              <div
                key={task.id}
                className="warning-card"
                tabIndex={0}
                style={{ backgroundColor: color.bg, color: color.fg }}
              >
                <span className="warning-card-name">{task.title}</span>
                <span className="warning-help" role="img" aria-label="Warning details">?</span>
                <span className="warning-tooltip">
                  {warningByTask.get(task.id)?.map((msg, i) => (
                    <span key={i} className="warning-tooltip-line">{msg}</span>
                  ))}
                </span>
              </div>
            );
          })}
        {planner.dependency_warnings.length === 0 && (
          <div className="warnings-empty">No warnings</div>
        )}
      </section>
    </div>
  );
}
