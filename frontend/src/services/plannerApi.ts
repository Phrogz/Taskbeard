export type Team = {
  id: string;
  name: string;
  colors: Array<{ fg: string; bg: string }>;
  color?: string;
};

export type Student = {
  id: string;
  name: string;
  teams: string[];
};

export type TaskItem = {
  id: string;
  title: string;
  teams: string[];
  start_date: string;
  end_date: string;
  est_hours?: number;
  depends_on?: string[];
  assigned_to: string[];
  completed: boolean;
  priority: "need" | "want" | "nice";
};

export type PlannerPayload = {
  season: { start_date: string; end_date: string; timezone?: string };
  practices: {
    default_hours_per_day: Record<string, number>;
    overrides: Array<{ date: string; hours: number; label: string }>;
  };
  events: Array<{
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    travel?: Array<{ date: string; label: string }>;
  }>;
  breaks: Array<{ id: string; name: string; start_date: string; end_date: string }>;
  teams: Team[];
  members: Student[];
  tasks: TaskItem[];
  dates: Array<{ date: string; past: boolean; is_today: boolean; weekday: string }>;
  dependency_warnings: Array<{ task_id: string; dependency_id: string | null; message: string }>;
  student_task_map: Record<
    string,
    Array<{ task_id: string; title: string; start_date: string; end_date: string; completed: boolean }>
  >;
};

export async function getPlanner(): Promise<PlannerPayload> {
  const response = await fetch("/api/planner");
  if (!response.ok) throw new Error("Failed to load planner");
  return response.json();
}

export async function putConfig(name: string, payload: unknown): Promise<void> {
  const response = await fetch(`/api/config/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function putConfigYaml(name: string, yamlText: string): Promise<void> {
  const response = await fetch(`/api/config/${name}/yaml`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ yaml_text: yamlText })
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function putTasks(payload: { tasks: TaskItem[] }): Promise<void> {
  const response = await fetch("/api/tasks", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function createTask(payload: TaskItem): Promise<void> {
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function scheduleTask(
  taskId: string,
  payload: { start_date: string; end_date?: string; auto_span?: boolean }
): Promise<void> {
  const response = await fetch(`/api/tasks/${taskId}/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function updateTask(taskId: string, payload: Partial<TaskItem>): Promise<void> {
  const response = await fetch(`/api/tasks/${taskId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function setTaskCompleted(taskId: string, completed: boolean): Promise<void> {
  const response = await fetch(`/api/tasks/${taskId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed })
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function deleteTask(taskId: string): Promise<void> {
  const response = await fetch(`/api/tasks/${taskId}`, {
    method: "DELETE"
  });
  if (!response.ok) throw new Error(await response.text());
}

export function subscribePlannerUpdates(onUpdate: () => void): () => void {
  const source = new EventSource("/events");
  source.addEventListener("planner-update", () => onUpdate());
  source.onerror = () => {
    source.close();
  };
  return () => source.close();
}
