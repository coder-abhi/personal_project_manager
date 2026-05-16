"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getProjectTasks, getProjects, type Project, type Task, type TaskStatus } from "@/lib/api";

type TimelineTask = {
  id: string;
  title: string;
  projectName: string;
  status: TaskStatus;
  etaHours: number;
  timeSpentHours: number;
  startDay: number;
  durationDays: number;
  color: "blue" | "purple" | "pink" | "yellow" | "teal";
};

type ProjectWithTasks = {
  project: Project;
  tasks: Task[];
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const colors: TimelineTask["color"][] = ["blue", "purple", "pink", "yellow", "teal"];

const colorClasses = {
  blue: {
    track: "bg-blue-100",
    fill: "bg-blue-500",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  purple: {
    track: "bg-purple-100",
    fill: "bg-purple-500",
    text: "text-purple-700",
    dot: "bg-purple-500",
  },
  pink: {
    track: "bg-pink-100",
    fill: "bg-pink-500",
    text: "text-pink-700",
    dot: "bg-pink-500",
  },
  yellow: {
    track: "bg-yellow-100",
    fill: "bg-yellow-400",
    text: "text-yellow-700",
    dot: "bg-yellow-400",
  },
  teal: {
    track: "bg-teal-100",
    fill: "bg-teal-500",
    text: "text-teal-700",
    dot: "bg-teal-500",
  },
};

const startClasses: Record<number, string> = {
  1: "col-start-1",
  2: "col-start-2",
  3: "col-start-3",
  4: "col-start-4",
  5: "col-start-5",
  6: "col-start-6",
  7: "col-start-7",
};

const durationClasses: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
  7: "col-span-7",
};

const statusLabels = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  delayed: "Delayed",
};

export default function TimelinePage() {
  const [items, setItems] = useState<ProjectWithTasks[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTimeline() {
      setError(null);
      const projects = await getProjects();
      const taskGroups = await Promise.all(projects.map((project) => getProjectTasks(project.id)));

      setItems(projects.map((project, index) => ({ project, tasks: taskGroups[index] ?? [] })));
    }

    loadTimeline()
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const timelineTasks = useMemo(
    () =>
      items.flatMap((item, projectIndex) =>
        item.tasks.map((task, taskIndex) => toTimelineTask(task, item.project.name, projectIndex + taskIndex)),
      ),
    [items],
  );

  const groupedTasks = groupTasksByProject(timelineTasks);
  const totalPlanned = timelineTasks.reduce((sum, task) => sum + task.etaHours, 0);
  const totalSpent = timelineTasks.reduce((sum, task) => sum + task.timeSpentHours, 0);
  const completedTasks = timelineTasks.filter((task) => task.status === "done").length;
  const delayedTasks = timelineTasks.filter((task) => task.status === "delayed").length;
  const efficiency = totalPlanned === 0 ? 0 : Math.round((totalSpent / totalPlanned) * 100);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8 md:py-12">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-gray-500">Planning Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold text-gray-950 md:text-4xl">Timeline</h1>
          <p className="mt-3 max-w-2xl text-base text-gray-500">Plan tasks, track ETA, and compare actual progress</p>
        </div>
        <Link
          href="/"
          className="w-fit rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800"
        >
          + Add Task
        </Link>
      </header>

      {error ? <p className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}

      <section className="mt-8 grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-950">Weekly Plan</h2>
            <p className="mt-1 text-sm text-gray-500">{timelineTasks.length} current tasks across {items.length} projects</p>
          </div>

          {isLoading ? <p className="p-6 text-sm text-gray-500">Loading timeline...</p> : null}

          {!isLoading && timelineTasks.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-base font-semibold text-gray-950">No tasks yet</p>
              <p className="mt-2 text-sm text-gray-500">Create tasks inside a project and they will appear here automatically.</p>
            </div>
          ) : null}

          {!isLoading && timelineTasks.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[980px]">
                <div className="grid grid-cols-[260px_1fr] border-b border-gray-100 bg-gray-50/80">
                  <div className="px-5 py-4 text-sm font-semibold text-gray-500">Tasks</div>
                  <div className="grid grid-cols-7">
                    {days.map((day) => (
                      <div key={day} className="border-l border-gray-100 px-4 py-4 text-center text-sm font-semibold text-gray-600">
                        {day}
                      </div>
                    ))}
                  </div>
                </div>

                {groupedTasks.map(([projectName, projectTasks]) => (
                  <div key={projectName}>
                    <div className="grid grid-cols-[260px_1fr] bg-gray-50/60">
                      <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{projectName}</div>
                      <div className="grid grid-cols-7">
                        {days.map((day) => (
                          <div key={day} className="border-l border-gray-100" />
                        ))}
                      </div>
                    </div>

                    {projectTasks.map((task) => (
                      <TimelineRow key={task.id} task={task} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">Summary</h2>
              <p className="mt-1 text-sm text-gray-500">Current tasks</p>
            </div>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700">{efficiency}%</span>
          </div>

          <div className="mt-5 space-y-3">
            <SummaryMetric label="Total planned hours" value={`${totalPlanned.toFixed(1)}h`} />
            <SummaryMetric label="Total time spent" value={`${totalSpent.toFixed(1)}h`} />
            <SummaryMetric label="Completed tasks" value={completedTasks} />
            <SummaryMetric label="Delayed tasks" value={delayedTasks} tone="danger" />
            <SummaryMetric label="Efficiency percentage" value={`${efficiency}%`} tone="success" />
          </div>
        </aside>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(["todo", "in_progress", "done", "delayed"] as TaskStatus[]).map((status) => (
          <StatusCard key={status} status={status} tasks={timelineTasks.filter((task) => task.status === status)} />
        ))}
      </section>
    </main>
  );
}

function TimelineRow({ task }: { task: TimelineTask }) {
  const progress = task.etaHours === 0 ? 0 : Math.min(Math.round((task.timeSpentHours / task.etaHours) * 100), 100);
  const colors = colorClasses[task.color];
  const percentageTextColor = progress > 45 ? "text-white" : colors.text;

  return (
    <div className="grid grid-cols-[260px_1fr] border-t border-gray-100">
      <div className="flex items-center gap-3 px-5 py-4">
        <span className={`h-2.5 w-2.5 rounded-full ${colors.dot}`} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-950">{task.title}</p>
          <p className="mt-1 text-xs text-gray-500">
            {task.timeSpentHours}h spent / {task.etaHours}h ETA
          </p>
        </div>
      </div>
      <div className="grid grid-cols-7 items-center">
        {days.map((day) => (
          <div key={day} className="h-full border-l border-gray-100" />
        ))}
        <div className={`col-start-1 row-start-1 grid grid-cols-7 px-3 ${durationClasses[7]}`}>
          <div
            className={`relative h-9 self-center overflow-hidden rounded-full ${colors.track} ${startClasses[task.startDay]} ${durationClasses[task.durationDays]} shadow-sm`}
          >
            <div className={`absolute inset-y-0 left-0 rounded-full ${colors.fill}`} style={{ width: `${progress}%` }} />
            <div className={`absolute inset-0 flex items-center justify-center px-3 text-xs font-bold ${percentageTextColor}`}>
              {progress}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "danger" | "success";
}) {
  const valueColor = tone === "danger" ? "text-red-600" : tone === "success" ? "text-teal-600" : "text-gray-950";

  return (
    <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-base font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}

function StatusCard({ status, tasks }: { status: TaskStatus; tasks: TimelineTask[] }) {
  const accentByStatus = {
    todo: "border-blue-100 bg-blue-50/60 text-blue-700",
    in_progress: "border-purple-100 bg-purple-50/60 text-purple-700",
    done: "border-teal-100 bg-teal-50/60 text-teal-700",
    delayed: "border-pink-100 bg-pink-50/60 text-pink-700",
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-950">{statusLabels[status]}</h3>
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${accentByStatus[status]}`}>{tasks.length}</span>
      </div>
      <div className="mt-4 space-y-3">
        {tasks.length === 0 ? <p className="text-sm text-gray-400">No tasks</p> : null}
        {tasks.slice(0, 3).map((task) => {
          const colors = colorClasses[task.color];

          return (
            <div key={task.id} className="rounded-xl bg-gray-50 p-3">
              <p className="text-sm font-semibold text-gray-950">{task.title}</p>
              <p className={`mt-1 text-xs font-medium ${colors.text}`}>{task.projectName}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function toTimelineTask(task: Task, projectName: string, colorIndex: number): TimelineTask {
  const startDay = getWeekdayColumn(task.created_at);
  const durationDays = getDurationDays(task, startDay);

  return {
    id: task.id,
    title: task.title,
    projectName,
    status: task.status,
    etaHours: task.eta_hours,
    timeSpentHours: task.time_spent_hours,
    startDay,
    durationDays,
    color: colors[colorIndex % colors.length],
  };
}

function getWeekdayColumn(dateValue: string) {
  const day = new Date(dateValue).getDay();
  return day === 0 ? 7 : day;
}

function getDurationDays(task: Task, startDay: number) {
  const maxDuration = 8 - startDay;
  const estimatedDuration = Math.max(1, Math.ceil(task.eta_hours / 4));

  if (!task.deadline) {
    return Math.min(estimatedDuration, maxDuration);
  }

  const start = new Date(task.created_at).getTime();
  const end = new Date(task.deadline).getTime();
  const deadlineDuration = Math.max(1, Math.ceil((end - start) / 86_400_000) + 1);

  return Math.min(deadlineDuration, maxDuration);
}

function groupTasksByProject(items: TimelineTask[]) {
  return items.reduce<[string, TimelineTask[]][]>((groups, task) => {
    const group = groups.find(([projectName]) => projectName === task.projectName);

    if (group) {
      group[1].push(task);
      return groups;
    }

    return [...groups, [task.projectName, [task]]];
  }, []);
}
