"use client";

import { type CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { getProjectTasks, getProjects, type Project, type Task } from "@/lib/api";

type TimerMode = "focus" | "short" | "long";
type SessionState = "idle" | "running" | "paused";
type TimingMode = "standard" | "custom" | "auto";
type Mood = "Clear" | "Calm" | "Neutral" | "Restless" | "Drained";

type DurationSet = Record<TimerMode, number>;

type PomodoroLog = {
  id: string;
  completedAt: string;
  startAt?: string;
  endAt?: string;
  minutes: number;
  mode: TimerMode;
  projectId?: string;
  projectName: string;
  taskId?: string;
  taskTitle: string;
  done?: string;
  mood?: Mood | null;
  energy?: number | null;
  focus?: number | null;
  isManual?: boolean;
};

type SessionDraft = {
  id?: string;
  source: "timer" | "manual" | "edit";
  mode: TimerMode;
  startAt: string;
  endAt: string;
  projectId: string;
  taskId: string;
  done: string;
  mood: Mood | "";
  energy: number;
  focus: number;
};

const storageKey = "personal-project-manager:pomodoro-logs";
const standardDurations: DurationSet = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};
const modeLabels: Record<TimerMode, string> = {
  focus: "Focus",
  short: "Short Break",
  long: "Long Break",
};
const moods: Mood[] = ["Clear", "Calm", "Neutral", "Restless", "Drained"];
const moodScores: Record<Mood, number> = {
  Clear: 95,
  Calm: 86,
  Neutral: 68,
  Restless: 44,
  Drained: 28,
};

export default function PomodoroPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasksByProject, setTasksByProject] = useState<Record<string, Task[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timingMode, setTimingMode] = useState<TimingMode>("standard");
  const [customFocusMinutes, setCustomFocusMinutes] = useState(25);
  const [customBreakMinutes, setCustomBreakMinutes] = useState(5);
  const [mode, setMode] = useState<TimerMode>("focus");
  const [secondsLeft, setSecondsLeft] = useState(standardDurations.focus);
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [logs, setLogs] = useState<PomodoroLog[]>([]);
  const [hasLoadedLogs, setHasLoadedLogs] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [draft, setDraft] = useState<SessionDraft | null>(null);

  useEffect(() => {
    async function loadProjectsAndTasks() {
      setError(null);
      const nextProjects = await getProjects();
      const taskGroups = await Promise.all(nextProjects.map((project) => getProjectTasks(project.id)));
      const nextTasksByProject = nextProjects.reduce<Record<string, Task[]>>((acc, project, index) => {
        acc[project.id] = taskGroups[index] ?? [];
        return acc;
      }, {});

      setProjects(nextProjects);
      setTasksByProject(nextTasksByProject);
      setProjectId(nextProjects[0]?.id ?? "");
    }

    loadProjectsAndTasks()
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const savedLogs = window.localStorage.getItem(storageKey);
    if (!savedLogs) {
      setHasLoadedLogs(true);
      return;
    }

    try {
      setLogs(JSON.parse(savedLogs) as PomodoroLog[]);
    } catch {
      setLogs([]);
    } finally {
      setHasLoadedLogs(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedLogs) return;
    window.localStorage.setItem(storageKey, JSON.stringify(logs));
  }, [hasLoadedLogs, logs]);

  const autoPlan = useMemo(() => calculateAutoPlan(logs), [logs]);
  const activeDurations = useMemo<DurationSet>(() => {
    if (timingMode === "standard") return standardDurations;
    if (timingMode === "auto") {
      return {
        focus: autoPlan.focusMinutes * 60,
        short: autoPlan.breakMinutes * 60,
        long: Math.max(autoPlan.breakMinutes * 3, 10) * 60,
      };
    }

    return {
      focus: customFocusMinutes * 60,
      short: customBreakMinutes * 60,
      long: Math.max(customBreakMinutes * 3, 10) * 60,
    };
  }, [autoPlan, customBreakMinutes, customFocusMinutes, timingMode]);

  const currentModeDuration = activeDurations[mode];

  useEffect(() => {
    if (sessionState === "idle") setSecondsLeft(currentModeDuration);
  }, [currentModeDuration, sessionState]);

  useEffect(() => {
    if (sessionState !== "running") return;

    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          completeTimerSession();
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [currentModeDuration, mode, projectId, sessionStartedAt, sessionState, taskId]);

  const selectedProject = projects.find((project) => project.id === projectId);
  const selectedTasks = projectId ? tasksByProject[projectId] ?? [] : [];
  const selectedTask = selectedTasks.find((task) => task.id === taskId);
  const completedToday = logs.filter((log) => isToday(new Date(log.completedAt))).length;
  const totalFocusMinutes = logs.filter((log) => log.mode === "focus").reduce((sum, log) => sum + log.minutes, 0);
  const averageFocus = getAverage(logs.map((log) => log.focus).filter(isNumber));
  const completionPercent = Math.round(((currentModeDuration - secondsLeft) / currentModeDuration) * 100);
  const minutesLabel = formatSeconds(secondsLeft);
  const heatmapDays = useMemo(() => buildHeatmapDays(logs), [logs]);

  function changeMode(nextMode: TimerMode) {
    setMode(nextMode);
    setSecondsLeft(activeDurations[nextMode]);
    setSessionState("idle");
    setSessionStartedAt(null);
  }

  function startOrPauseTimer() {
    if (sessionState === "running") {
      setSessionState("paused");
      return;
    }

    if (secondsLeft === 0) setSecondsLeft(currentModeDuration);
    if (!sessionStartedAt) setSessionStartedAt(new Date().toISOString());
    setSessionState("running");
  }

  function resetTimer() {
    setSecondsLeft(currentModeDuration);
    setSessionState("idle");
    setSessionStartedAt(null);
  }

  function completeTimerSession() {
    const endAt = new Date();
    const startAt = sessionStartedAt ? new Date(sessionStartedAt) : new Date(endAt.getTime() - currentModeDuration * 1000);
    setSessionState("idle");
    setSessionStartedAt(null);
    setDraft(createDraft("timer", {
      startAt: toDateTimeLocal(startAt),
      endAt: toDateTimeLocal(endAt),
      mode,
      projectId,
      taskId,
    }));
  }

  function openManualSession() {
    const endAt = new Date();
    const startAt = new Date(endAt.getTime() - activeDurations.focus * 1000);
    setDraft(createDraft("manual", {
      startAt: toDateTimeLocal(startAt),
      endAt: toDateTimeLocal(endAt),
      mode: "focus",
      projectId,
      taskId,
    }));
  }

  function openEditSession(log: PomodoroLog) {
    setDraft({
      id: log.id,
      source: "edit",
      mode: log.mode,
      startAt: toDateTimeLocal(new Date(log.startAt ?? log.completedAt)),
      endAt: toDateTimeLocal(new Date(log.endAt ?? log.completedAt)),
      projectId: log.projectId ?? "",
      taskId: log.taskId ?? "",
      done: log.done ?? "",
      mood: log.mood ?? "",
      energy: log.energy ?? 7,
      focus: log.focus ?? 80,
    });
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;

    const nextLog = draftToLog(draft);
    setLogs((current) => {
      if (draft.id) return current.map((log) => (log.id === draft.id ? nextLog : log));
      return [nextLog, ...current].slice(0, 80);
    });
    setDraft(null);
    resetTimer();
  }

  function saveDraftWithoutDetails() {
    if (!draft) return;

    const nextLog = draftToLog({ ...draft, done: "", mood: "", energy: 0, focus: 0 });
    setLogs((current) => [nextLog, ...current].slice(0, 80));
    setDraft(null);
    resetTimer();
  }

  function draftToLog(nextDraft: SessionDraft): PomodoroLog {
    const draftProject = projects.find((project) => project.id === nextDraft.projectId);
    const draftTask = (tasksByProject[nextDraft.projectId] ?? []).find((task) => task.id === nextDraft.taskId);
    const startAt = new Date(nextDraft.startAt);
    const endAt = new Date(nextDraft.endAt);
    const minutes = Math.max(1, Math.round((endAt.getTime() - startAt.getTime()) / 60_000));

    return {
      id: nextDraft.id ?? crypto.randomUUID(),
      completedAt: endAt.toISOString(),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      minutes,
      mode: nextDraft.mode,
      projectId: nextDraft.projectId || undefined,
      projectName: draftProject?.name ?? "Unassigned",
      taskId: nextDraft.taskId || undefined,
      taskTitle: draftTask?.title ?? "General focus",
      done: nextDraft.done.trim() || undefined,
      mood: nextDraft.mood || null,
      energy: nextDraft.energy || null,
      focus: nextDraft.focus || null,
      isManual: nextDraft.source === "manual",
    };
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f6f3] text-stone-950">
      <section className="relative border-b border-stone-200">
        <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_18%_18%,rgba(20,184,166,0.25),transparent_28%),radial-gradient(circle_at_78%_4%,rgba(251,146,60,0.24),transparent_26%),linear-gradient(135deg,#fff8ed_0%,#eefaf7_55%,#f7edf6_100%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-6 px-5 py-8 md:grid-cols-[0.95fr_1.05fr] md:px-8 md:py-12">
          <div className="flex min-h-[360px] flex-col justify-between">
            <div>
              <p className="inline-flex rounded-full border border-stone-200 bg-white/70 px-4 py-2 text-sm font-medium text-stone-700 shadow-sm backdrop-blur">
                Pomodoro
              </p>
              <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-tight text-stone-950 md:text-7xl">Timebox the work. Keep the receipt.</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-700">
                Run a focused sprint, then log what moved, how it felt, and which project earned the minutes.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3">
              <HeroMetric label="Today" value={`${completedToday}`} detail="sessions" />
              <HeroMetric label="Focus" value={`${totalFocusMinutes}`} detail="minutes" />
              <HeroMetric label="Average" value={`${averageFocus}%`} detail="focus" />
            </div>
          </div>

          <div className="rounded-lg border border-white/70 bg-white/80 p-5 shadow-xl shadow-stone-900/10 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex rounded-full border border-stone-200 bg-stone-100 p-1">
                {(Object.keys(activeDurations) as TimerMode[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => changeMode(item)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      mode === item ? "bg-stone-950 text-white shadow-sm" : "text-stone-600 hover:bg-white hover:text-stone-950"
                    }`}
                  >
                    {modeLabels[item]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={openManualSession}
                className="rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
              >
                Add Session
              </button>
            </div>

            <div className="mt-5 rounded-lg border border-stone-200 bg-white/70 p-4">
              <div className="flex flex-wrap gap-2">
                {(["standard", "custom", "auto"] as TimingMode[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setTimingMode(item);
                      setSessionState("idle");
                      setSessionStartedAt(null);
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      timingMode === item ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-950"
                    }`}
                  >
                    {item === "auto" ? "Auto AI" : titleCase(item)}
                  </button>
                ))}
              </div>

              {timingMode === "custom" ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <NumberField label="Focus minutes" max={90} min={5} value={customFocusMinutes} onChange={setCustomFocusMinutes} />
                  <NumberField label="Break minutes" max={30} min={1} value={customBreakMinutes} onChange={setCustomBreakMinutes} />
                </div>
              ) : null}

              {timingMode === "auto" ? (
                <div className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
                  <TimingMetric label="Recommended" value={`${autoPlan.focusMinutes}/${autoPlan.breakMinutes}`} detail="focus/break" />
                  <TimingMetric label="Streak" value={`${autoPlan.streak}`} detail="days" />
                  <TimingMetric label="Signal" value={`${autoPlan.confidence}%`} detail={autoPlan.reason} />
                </div>
              ) : null}
            </div>

            <div className="mt-8 grid place-items-center">
              <div
                className="relative grid aspect-square w-full max-w-[320px] place-items-center rounded-full bg-[conic-gradient(#14b8a6_var(--progress),#e7e5e4_0)] p-3"
                style={{ "--progress": `${completionPercent}%` } as CSSProperties}
              >
                <div className="grid h-full w-full place-items-center rounded-full bg-white shadow-inner">
                  <div className="text-center">
                    <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">{modeLabels[mode]}</p>
                    <p className="mt-3 text-6xl font-semibold tabular-nums text-stone-950">{minutesLabel}</p>
                    <p className="mt-3 text-sm text-stone-500">{sessionState === "running" ? "Running" : sessionState === "paused" ? "Paused" : "Ready"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-center gap-3">
              <button
                type="button"
                onClick={startOrPauseTimer}
                className="rounded-full bg-stone-950 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-stone-900/15 transition hover:-translate-y-0.5 hover:bg-stone-800"
              >
                {sessionState === "running" ? "Pause" : "Start"}
              </button>
              <button
                type="button"
                onClick={resetTimer}
                className="rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-8 md:px-8 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Session density</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-950">Focus calendar</h2>
            </div>
            <span className="w-fit rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-700">Last 12 weeks</span>
          </div>

          {error ? <p className="mt-5 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{error}</p> : null}

          <div className="mt-6 overflow-x-auto">
            <div className="grid w-max grid-flow-col grid-rows-7 gap-1">
              {heatmapDays.map((day) => (
                <div
                  key={day.iso}
                  title={`${day.label}: ${day.count} sessions, ${day.minutes} focus minutes`}
                  className={`h-4 w-4 rounded-sm border border-white ${heatClass(day.count)}`}
                />
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4 text-xs text-stone-500">
            <span>Less</span>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((level) => (
                <span key={level} className={`h-3 w-3 rounded-sm ${heatClass(level)}`} />
              ))}
            </div>
            <span>More</span>
          </div>
        </div>

        <aside className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Recent work</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-950">Pomodoro trail</h2>
            </div>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-700">{logs.length}</span>
          </div>

          <div className="mt-5 space-y-3">
            {logs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
                <p className="text-sm font-semibold text-stone-950">No sessions logged yet</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">Run a sprint or add one manually and your notes will stack up here.</p>
              </div>
            ) : null}

            {logs.slice(0, 8).map((log) => {
              const missingDetails = isMissingDetails(log);

              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => openEditSession(log)}
                  className={`block w-full rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                    missingDetails ? "border-orange-200 bg-orange-50/80" : "border-stone-200 bg-stone-50/70 hover:bg-stone-50"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-stone-950">{log.taskTitle}</p>
                      <p className="mt-1 text-xs font-medium text-teal-700">{log.projectName}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-700 shadow-sm">{log.minutes} min</span>
                  </div>
                  <p className={`mt-3 text-sm leading-6 ${missingDetails ? "font-medium text-orange-800" : "text-stone-700"}`}>
                    {log.done || "Missing log details. Click to add what got done."}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <LogMetric label="Mood" value={log.mood ?? "Missing"} />
                    <LogMetric label="Energy" value={isNumber(log.energy) ? `${log.energy}/10` : "Missing"} />
                    <LogMetric label="Focus" value={isNumber(log.focus) ? `${log.focus}%` : "Missing"} />
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      </section>

      {draft ? (
        <SessionModal
          draft={draft}
          isLoading={isLoading}
          modeOptions={modeLabels}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={saveDraft}
          onSaveWithoutDetails={draft.source === "timer" ? saveDraftWithoutDetails : undefined}
          projects={projects}
          tasksByProject={tasksByProject}
        />
      ) : null}
    </main>
  );
}

function SessionModal({
  draft,
  isLoading,
  modeOptions,
  onChange,
  onClose,
  onSave,
  onSaveWithoutDetails,
  projects,
  tasksByProject,
}: {
  draft: SessionDraft;
  isLoading: boolean;
  modeOptions: Record<TimerMode, string>;
  onChange: (draft: SessionDraft) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSaveWithoutDetails?: () => void;
  projects: Project[];
  tasksByProject: Record<string, Task[]>;
}) {
  const tasks = draft.projectId ? tasksByProject[draft.projectId] ?? [] : [];
  const title = draft.source === "manual" ? "Add Session" : draft.source === "edit" ? "Edit Session" : "Session Complete";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-stone-950/45 px-5 py-8 backdrop-blur-sm">
      <form onSubmit={onSave} className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-2xl shadow-stone-950/30">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">{draft.source === "timer" ? "End of sprint" : "Pomodoro log"}</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-stone-200 text-xl leading-none text-stone-500 transition hover:bg-stone-50 hover:text-stone-950"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <label className="block text-sm font-medium text-stone-700">
            Type
            <select
              value={draft.mode}
              onChange={(event) => onChange({ ...draft, mode: event.target.value as TimerMode })}
              className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-3 outline-none ring-teal-600/15 transition focus:border-teal-600 focus:ring-4"
            >
              {(Object.keys(modeOptions) as TimerMode[]).map((item) => (
                <option key={item} value={item}>
                  {modeOptions[item]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-stone-700">
            Start time
            <input
              type="datetime-local"
              value={draft.startAt}
              onChange={(event) => onChange({ ...draft, startAt: event.target.value })}
              className="mt-2 w-full rounded-md border border-stone-300 px-4 py-3 outline-none ring-teal-600/15 transition focus:border-teal-600 focus:ring-4"
            />
          </label>

          <label className="block text-sm font-medium text-stone-700">
            End time
            <input
              type="datetime-local"
              value={draft.endAt}
              onChange={(event) => onChange({ ...draft, endAt: event.target.value })}
              className="mt-2 w-full rounded-md border border-stone-300 px-4 py-3 outline-none ring-teal-600/15 transition focus:border-teal-600 focus:ring-4"
            />
          </label>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-stone-700">
            Project
            <select
              value={draft.projectId}
              onChange={(event) => onChange({ ...draft, projectId: event.target.value, taskId: "" })}
              className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-3 outline-none ring-teal-600/15 transition focus:border-teal-600 focus:ring-4"
            >
              <option value="">Unassigned</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-stone-700">
            Task
            <select
              value={draft.taskId}
              onChange={(event) => onChange({ ...draft, taskId: event.target.value })}
              disabled={!draft.projectId || isLoading}
              className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-3 outline-none ring-teal-600/15 transition focus:border-teal-600 focus:ring-4 disabled:bg-stone-100"
            >
              <option value="">General focus</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-5 block text-sm font-medium text-stone-700">
          What got done
          <textarea
            value={draft.done}
            onChange={(event) => onChange({ ...draft, done: event.target.value })}
            rows={4}
            placeholder="Shipped the timeline fix, drafted notes, cleared review comments..."
            className="mt-2 w-full resize-none rounded-md border border-stone-300 px-4 py-3 outline-none ring-teal-600/15 transition focus:border-teal-600 focus:ring-4"
          />
        </label>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="block text-sm font-medium text-stone-700">
            Mood
            <select
              value={draft.mood}
              onChange={(event) => onChange({ ...draft, mood: event.target.value as Mood | "" })}
              className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-3 outline-none ring-teal-600/15 transition focus:border-teal-600 focus:ring-4"
            >
              <option value="">Select mood</option>
              {moods.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <RangeInput label="Energy" max={10} min={1} suffix="/10" value={draft.energy} onChange={(value) => onChange({ ...draft, energy: value })} />
          <RangeInput label="Focus" max={100} min={0} suffix="%" value={draft.focus} onChange={(value) => onChange({ ...draft, focus: value })} />
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {onSaveWithoutDetails ? (
            <button
              type="button"
              onClick={onSaveWithoutDetails}
              className="rounded-full border border-orange-200 bg-orange-50 px-5 py-2.5 text-sm font-semibold text-orange-800 transition hover:bg-orange-100"
            >
              Save Missing Details
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50">
            Cancel
          </button>
          <button className="rounded-full bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800">
            Save Session
          </button>
        </div>
      </form>
    </div>
  );
}

function createDraft(source: SessionDraft["source"], seed: Pick<SessionDraft, "mode" | "startAt" | "endAt" | "projectId" | "taskId">): SessionDraft {
  return {
    source,
    ...seed,
    done: "",
    mood: "",
    energy: 7,
    focus: 80,
  };
}

function calculateAutoPlan(logs: PomodoroLog[]) {
  const focusLogs = logs.filter((log) => log.mode === "focus");
  const recentLogs = focusLogs.filter((log) => daysBetween(new Date(log.completedAt), new Date()) <= 14);
  const sourceLogs = recentLogs.length >= 3 ? recentLogs : focusLogs;
  const avgFocus = getAverage(sourceLogs.map((log) => log.focus).filter(isNumber)) || 75;
  const avgEnergy = getAverage(sourceLogs.map((log) => log.energy).filter(isNumber)) * 10 || 70;
  const avgMood = getAverage(sourceLogs.map((log) => (log.mood ? moodScores[log.mood] : null)).filter(isNumber)) || 70;
  const avgMinutes = getAverage(sourceLogs.map((log) => log.minutes)) || 25;
  const activeDays = new Set(sourceLogs.map((log) => dateKey(new Date(log.completedAt)))).size || 1;
  const frequency = Math.min(sourceLogs.length / activeDays, 4);
  const streak = getCurrentStreak(logs);
  const readiness = avgFocus * 0.4 + avgEnergy * 0.25 + avgMood * 0.2 + frequency * 6 + Math.min(streak, 7) * 1.5;
  const base = readiness >= 86 ? 40 : readiness >= 76 ? 35 : readiness >= 64 ? 30 : readiness >= 52 ? 25 : 20;
  const focusMinutes = clamp(Math.round((base * 0.7 + avgMinutes * 0.3) / 5) * 5, 15, 45);
  const breakMinutes = focusMinutes >= 40 ? 10 : focusMinutes >= 30 ? 7 : 5;
  const reason = sourceLogs.length < 3 ? "warming up" : readiness >= 76 ? "strong rhythm" : readiness >= 52 ? "steady" : "recovery";

  return {
    breakMinutes,
    confidence: clamp(Math.round(Math.min(sourceLogs.length, 20) * 5), 20, 100),
    focusMinutes,
    reason,
    streak,
  };
}

function buildHeatmapDays(logs: PomodoroLog[]) {
  const today = startOfDay(new Date());
  const start = addDays(today, -83);
  const counts = logs.reduce<Record<string, { count: number; minutes: number }>>((acc, log) => {
    const key = dateKey(new Date(log.completedAt));
    acc[key] = acc[key] ?? { count: 0, minutes: 0 };
    acc[key].count += 1;
    if (log.mode === "focus") acc[key].minutes += log.minutes;
    return acc;
  }, {});

  return Array.from({ length: 84 }, (_, index) => {
    const date = addDays(start, index);
    const day = counts[dateKey(date)] ?? { count: 0, minutes: 0 };
    return {
      ...day,
      iso: date.toISOString(),
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    };
  });
}

function HeroMetric({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/80 p-4 shadow-sm backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-stone-950">{value}</p>
      <p className="mt-1 text-sm text-stone-500">{detail}</p>
    </div>
  );
}

function TimingMetric({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="rounded-md bg-stone-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-stone-950">{value}</p>
      <p className="text-xs text-stone-500">{detail}</p>
    </div>
  );
}

function NumberField({ label, max, min, onChange, value }: { label: string; max: number; min: number; onChange: (value: number) => void; value: number }) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        className="mt-2 w-full rounded-md border border-stone-300 px-4 py-3 outline-none ring-teal-600/15 transition focus:border-teal-600 focus:ring-4"
      />
    </label>
  );
}

function RangeInput({
  label,
  max,
  min,
  onChange,
  suffix,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span className="flex items-center justify-between gap-3">
        {label}
        <span className="font-semibold text-stone-950">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-4 w-full accent-teal-600"
      />
    </label>
  );
}

function LogMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white p-2">
      <p className="text-[11px] font-medium text-stone-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function heatClass(count: number) {
  if (count >= 4) return "bg-teal-700";
  if (count === 3) return "bg-teal-500";
  if (count === 2) return "bg-teal-300";
  if (count === 1) return "bg-teal-100";
  return "bg-stone-100";
}

function isMissingDetails(log: PomodoroLog) {
  return !log.done || !log.mood || !isNumber(log.energy) || !isNumber(log.focus);
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function toDateTimeLocal(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function isToday(date: Date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getAverage(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function daysBetween(a: Date, b: Date) {
  return Math.floor(Math.abs(startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

function dateKey(date: Date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

function getCurrentStreak(logs: PomodoroLog[]) {
  const activeDays = new Set(logs.map((log) => dateKey(new Date(log.completedAt))));
  let cursor = startOfDay(new Date());
  let streak = 0;

  while (activeDays.has(dateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}
