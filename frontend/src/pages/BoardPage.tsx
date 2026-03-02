import { useMemo } from "react";
import { StudentPanel } from "../components/StudentPanel";
import { TimelineGrid } from "../components/TimelineGrid";
import type { PlannerPayload, TaskItem } from "../services/plannerApi";

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

export function BoardPage({
  planner,
  onMoveTask,
  onResizeTask,
  onToggleTaskComplete,
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
          onMoveTask={onMoveTask}
          onResizeTask={onResizeTask}
          onToggleTaskComplete={onToggleTaskComplete}
          onDeleteTask={onDeleteTask}
          selectedTaskPlacement={selectedTaskPlacement}
          renamingTaskId={renamingTaskId}
          renameDraft={renameDraft}
          onSelectTask={onSelectTask}
          onClearSelection={onClearSelection}
          onStartRenameTask={onStartRenameTask}
          onRenameDraftChange={onRenameDraftChange}
          onCommitRename={onCommitRename}
          onCancelRename={onCancelRename}
          onCreateTaskAt={onCreateTaskAt}
        />
      </div>
      <aside className="board-sidebar">
        <StudentPanel planner={planner} />
        <div className="warnings">
          <h3>Dependency Warnings</h3>
          {planner.tasks
            .filter((task) => warningByTask.has(task.id))
            .map((task) => (
              <div key={task.id} className="warning-item" title={warningByTask.get(task.id)?.join("\n")}>
                {task.title}
              </div>
            ))}
          {planner.dependency_warnings.length === 0 && <div className="muted">No warnings</div>}
        </div>
      </aside>
    </div>
  );
}
