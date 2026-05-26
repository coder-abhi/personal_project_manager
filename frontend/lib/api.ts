export type ProjectType = "continuous" | "fixed";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "high" | "medium" | "low";
export type BookStatus = "yet_to_start" | "reading" | "read";

export type Project = {
  id: string;
  name: string;
  type: ProjectType;
  created_at: string;
};

export type ProjectSummary = Project & {
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  overdue_tasks: number;
  eta_hours: number;
  time_spent_hours: number;
  completed_hours: number;
  remaining_hours: number;
  next_deadline?: string | null;
};

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  eta_hours: number;
  time_spent_hours: number;
  start_date?: string | null;
  deadline?: string | null;
  created_at: string;
};

export type ProjectInput = Pick<Project, "name" | "type">;
export type TaskInput = Omit<Task, "id" | "created_at">;
export type TaskUpdate = Partial<Omit<Task, "id" | "project_id" | "created_at">>;

export type BookChapter = {
  id: string;
  book_id: string;
  title: string;
  position: number;
  resonated: boolean;
};

export type Book = {
  id: string;
  title: string;
  author?: string | null;
  category: string;
  total_pages: number;
  status: BookStatus;
  liked: boolean;
  rating?: number | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  created_at: string;
  pages_read: number;
  pages_remaining: number;
  chapters: BookChapter[];
};

export type BookInput = Omit<Book, "id" | "created_at" | "chapters" | "pages_read" | "pages_remaining">;
export type BookUpdate = Partial<BookInput>;

export type ReadingLogInput = {
  book_id: string;
  pages_read: number;
  read_at?: string | null;
  note?: string | null;
};

export type LibrarySummary = {
  total_books: number;
  read_books: number;
  liked_books: number;
  yet_to_start_books: number;
  reading_books: number;
  pages_today: number;
  pages_this_week: number;
  current_categories: string[];
  daywise_pages: { date: string; pages: number }[];
  monthly_pages: { month: string; pages: number }[];
  categories: { category: string; books: number }[];
};

export type SuggestedBook = {
  title: string;
  author?: string | null;
  category: string;
  reason: string;
};

export type OwnedBookRecommendation = {
  book_id: string;
  title: string;
  author?: string | null;
  category: string;
  status: BookStatus;
  reason: string;
};

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

  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

export function getProjects() {
  return request<Project[]>("/projects");
}

export function getProjectSummaries() {
  return request<ProjectSummary[]>("/projects/summary");
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

export function getLibrarySummary() {
  return request<LibrarySummary>("/library/summary");
}

export function getBooks() {
  return request<Book[]>("/library/books");
}

export function createBook(book: BookInput) {
  return request<Book>("/library/books", {
    method: "POST",
    body: JSON.stringify(book),
  });
}

export function updateBook(bookId: string, book: BookUpdate) {
  return request<Book>(`/library/books/${bookId}`, {
    method: "PUT",
    body: JSON.stringify(book),
  });
}

export function updateChapter(chapterId: string, resonated: boolean) {
  return request<BookChapter>(`/library/chapters/${chapterId}`, {
    method: "PUT",
    body: JSON.stringify({ resonated }),
  });
}

export function addChapter(bookId: string, title: string) {
  return request<BookChapter>(`/library/books/${bookId}/chapters`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function regenerateChapters(bookId: string) {
  return request<{ status: string }>(`/library/books/${bookId}/chapters/regenerate`, {
    method: "POST",
  });
}

export function deleteChapter(chapterId: string) {
  return request<void>(`/library/chapters/${chapterId}`, {
    method: "DELETE",
  });
}

export function deleteBookChapters(bookId: string) {
  return request<void>(`/library/books/${bookId}/chapters`, {
    method: "DELETE",
  });
}

export function createReadingLog(readingLog: ReadingLogInput) {
  return request<{ id: string } & ReadingLogInput>("/library/reading-logs", {
    method: "POST",
    body: JSON.stringify(readingLog),
  });
}

export function getLibraryRecommendations() {
  return request<SuggestedBook[]>("/library/recommendations");
}

export function getNextReadingBooks() {
  return request<OwnedBookRecommendation[]>("/library/next-reading");
}
