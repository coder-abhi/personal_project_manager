export type ProjectType = "continuous" | "fixed" | "study";
export type TaskStatus = "todo" | "in_progress" | "done" | "delayed";

export type Project = {
  id: string;
  name: string;
  type: ProjectType;
  created_at: string;
};

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  eta_hours: number;
  time_spent_hours: number;
  deadline?: string | null;
  created_at: string;
};

export type ProjectInput = Pick<Project, "name" | "type">;
export type TaskInput = Omit<Task, "id" | "created_at">;
export type TaskUpdate = Partial<Omit<Task, "id" | "project_id" | "created_at">>;

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getProjects() {
  return request<Project[]>("/projects");
}

export function createProject(project: ProjectInput) {
  return request<Project>("/projects", {
    method: "POST",
    body: JSON.stringify(project),
  });
}

export function getProjectTasks(projectId: string) {
  return request<Task[]>(`/projects/${projectId}/tasks`);
}

export function createTask(task: TaskInput) {
  return request<Task>("/tasks", {
    method: "POST",
    body: JSON.stringify(task),
  });
}

export function updateTask(taskId: string, task: TaskUpdate) {
  return request<Task>(`/tasks/${taskId}`, {
    method: "PUT",
    body: JSON.stringify(task),
  });
}
