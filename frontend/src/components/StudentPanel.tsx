import type { PlannerPayload } from "../services/plannerApi";

type Props = {
  planner: PlannerPayload;
};

export function StudentPanel({ planner }: Props) {
  return (
    <div className="student-panel">
      <h3>Members</h3>
      <div className="student-list">
        {planner.members.map((student) => {
          const tasks = planner.student_task_map[student.id] ?? [];
          const tooltip = tasks.length
            ? tasks.map((task) => `• ${task.title} (${task.start_date} → ${task.end_date})`).join("\n")
            : "No tasks assigned";
          return (
            <div key={student.id} className="student-row" title={tooltip}>
              <span className="student-name">{student.name}</span>
              <span className="student-teams">{student.teams.join(", ")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
