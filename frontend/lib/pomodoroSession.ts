export type PersistedPomodoroSession = {
  id: string;
  mode: "focus" | "short" | "long";
  durationSeconds: number;
  startedAt: string;
  endsAt: string | null;
  state: "running" | "paused";
  pausedRemainingSeconds: number | null;
  note: string;
  fixedProjectId: string;
  continuousProjectId: string;
};

export type PendingPomodoroCompletion = {
  id: string;
  mode: "focus" | "short" | "long";
  durationSeconds: number;
  startedAt: string;
  completedAt: string;
  note: string;
  fixedProjectId: string;
  continuousProjectId: string;
};

export const activePomodoroSessionKey = "personal-project-manager:active-pomodoro-session";
export const pendingPomodoroCompletionKey = "personal-project-manager:pending-pomodoro-completion";
export const pomodoroSessionCompletedEvent = "personal-project-manager:pomodoro-session-completed";
export const pomodoroSessionUpdatedEvent = "personal-project-manager:pomodoro-session-updated";

export function readActivePomodoroSession() {
  return readPomodoroValue<PersistedPomodoroSession>(activePomodoroSessionKey);
}

export function readPendingPomodoroCompletion() {
  return readPomodoroValue<PendingPomodoroCompletion>(pendingPomodoroCompletionKey);
}

export function announcePomodoroSessionUpdate() {
  window.dispatchEvent(new Event(pomodoroSessionUpdatedEvent));
}

export function announcePomodoroCompletion(completion: PendingPomodoroCompletion) {
  window.dispatchEvent(new CustomEvent<PendingPomodoroCompletion>(pomodoroSessionCompletedEvent, { detail: completion }));
}

function readPomodoroValue<T>(key: string) {
  const savedValue = window.localStorage.getItem(key);
  if (!savedValue) return null;

  try {
    return JSON.parse(savedValue) as T;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}
