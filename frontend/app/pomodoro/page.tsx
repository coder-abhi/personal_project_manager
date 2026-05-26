"use client";

import { type CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { getProjectTasks, getProjects, type Project, type Task } from "@/lib/api";

type TimerMode = "focus" | "short" | "long";
type SessionState = "idle" | "running" | "paused";
type Mood = "Clear" | "Calm" | "Neutral" | "Restless" | "Drained";

type PomodoroLog = {
  id: string;
  completedAt: string;
  minutes: number;
  mode: TimerMode;
  projectId: string;
  projectName: string;
  taskId: string;
  taskTitle: string;
  done: string;
  mood: Mood;
  energy: number;
  focus: number;
};

const storageKey = "personal-project-manager:pomodoro-logs";
const durations: Record<TimerMode, number> = {
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

export default function PomodoroPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasksByProject, setTasksByProject] = useState<Record<string, Task[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<TimerMode>("focus");
  const [secondsLeft, setSecondsLeft] = useState(durations.focus);
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [logs, setLogs] = useState<PomodoroLog[]>([]);
  const [hasLoadedLogs, setHasLoadedLogs] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [done, setDone] = useState("");
  const [mood, setMood] = useState<Mood>("Clear");
  const [energy, setEnergy] = useState(7);
  const [focus, setFocus] = useState(85);

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

  useEffect(() => {
    if (sessionState !== "running") return;

    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setSessionState("paused");
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [sessionState]);

  const taskOptions = useMemo(
    () =>
      projects.flatMap((project) =>
        (tasksByProject[project.id] ?? []).map((task) => ({
          projectId: project.id,
          projectName: project.name,
          taskId: task.id,
          taskTitle: task.title,
        })),
      ),
    [projects, tasksByProject],
  );

  const selectedProject = projects.find((project) => project.id === projectId);
  const selectedTasks = projectId ? tasksByProject[projectId] ?? [] : [];
  const selectedTask = selectedTasks.find((task) => task.id === taskId);
  const completedToday = logs.filter((log) => isToday(new Date(log.completedAt))).length;
  const totalFocusMinutes = logs.filter((log) => log.mode === "focus").reduce((sum, log) => sum + log.minutes, 0);
  const averageFocus = logs.length === 0 ? 0 : Math.round(logs.reduce((sum, log) => sum + log.focus, 0) / logs.length);
  const completionPercent = Math.round(((durations[mode] - secondsLeft) / durations[mode]) * 100);
  const minutesLabel = formatSeconds(secondsLeft);

  function changeMode(nextMode: TimerMode) {
    setMode(nextMode);
    setSecondsLeft(durations[nextMode]);
    setSessionState("idle");
  }

  function resetTimer() {
    setSecondsLeft(durations[mode]);
    setSessionState("idle");
  }

  function handleLogSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!done.trim()) return;

    const taskFromGlobalList = taskOptions.find((task) => task.taskId === taskId);
    const nextLog: PomodoroLog = {
      id: crypto.randomUUID(),
      completedAt: new Date().toISOString(),
      minutes: Math.max(1, Math.round((durations[mode] - secondsLeft) / 60) || durations[mode] / 60),
      mode,
      projectId,
      projectName: selectedProject?.name ?? taskFromGlobalList?.projectName ?? "Unassigned",
      taskId,
      taskTitle: selectedTask?.title ?? taskFromGlobalList?.taskTitle ?? "General focus",
      done: done.trim(),
      mood,
      energy,
      focus,
    };

    setLogs((current) => [nextLog, ...current].slice(0, 40));
    setDone("");
    setMood("Clear");
    setEnergy(7);
    setFocus(85);
    resetTimer();
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
                {(Object.keys(durations) as TimerMode[]).map((item) => (
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
              <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700">{completionPercent}%</span>
            </div>

            <div className="mt-8 grid place-items-center">
              <div className="relative grid aspect-square w-full max-w-[320px] place-items-center rounded-full bg-[conic-gradient(#14b8a6_var(--progress),#e7e5e4_0)] p-3" style={{ "--progress": `${completionPercent}%` } as CSSProperties}>
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
                onClick={() => setSessionState(sessionState === "running" ? "paused" : "running")}
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
        <form onSubmit={handleLogSession} className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Session log</p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-950">Capture the sprint</h2>
            </div>
            <span className="w-fit rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-700">{Math.round((durations[mode] - secondsLeft) / 60)} min elapsed</span>
          </div>

          {error ? <p className="mt-5 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{error}</p> : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-stone-700">
              Project
              <select
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setTaskId("");
                }}
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
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
                disabled={!projectId || isLoading}
                className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-3 outline-none ring-teal-600/15 transition focus:border-teal-600 focus:ring-4 disabled:bg-stone-100"
              >
                <option value="">General focus</option>
                {selectedTasks.map((task) => (
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
              value={done}
              onChange={(event) => setDone(event.target.value)}
              rows={4}
              placeholder="Shipped the timeline fix, drafted notes, cleared review comments..."
              className="mt-2 w-full resize-none rounded-md border border-stone-300 px-4 py-3 outline-none ring-teal-600/15 transition focus:border-teal-600 focus:ring-4"
            />
          </label>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="block text-sm font-medium text-stone-700">
              Mood
              <select
                value={mood}
                onChange={(event) => setMood(event.target.value as Mood)}
                className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-3 outline-none ring-teal-600/15 transition focus:border-teal-600 focus:ring-4"
              >
                {moods.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <RangeInput label="Energy" max={10} min={1} suffix="/10" value={energy} onChange={setEnergy} />
            <RangeInput label="Focus" max={100} min={0} suffix="%" value={focus} onChange={setFocus} />
          </div>

          <button
            disabled={!done.trim()}
            className="mt-6 rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-stone-900/15 transition hover:-translate-y-0.5 hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            Log Session
          </button>
        </form>

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
                <p className="mt-2 text-sm leading-6 text-stone-600">Run a sprint and your notes will stack up here.</p>
              </div>
            ) : null}

            {logs.slice(0, 8).map((log) => (
              <article key={log.id} className="rounded-lg border border-stone-200 bg-stone-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-stone-950">{log.taskTitle}</p>
                    <p className="mt-1 text-xs font-medium text-teal-700">{log.projectName}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-700 shadow-sm">{log.minutes} min</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-700">{log.done}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <LogMetric label="Mood" value={log.mood} />
                  <LogMetric label="Energy" value={`${log.energy}/10`} />
                  <LogMetric label="Focus" value={`${log.focus}%`} />
                </div>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
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

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function isToday(date: Date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}
