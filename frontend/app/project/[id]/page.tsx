"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { TaskItem } from "@/components/TaskItem";
import { TimelineBar } from "@/components/TimelineBar";
import { createTask, getProjects, getProjectTasks, updateTask, type Project, type Task, type TaskStatus } from "@/lib/api";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function ProjectDetailPage({ params }: PageProps) {
  const [projectId, setProjectId] = useState<string>("");
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eta, setEta] = useState("1");
  const [spent, setSpent] = useState("0");
  const [deadline, setDeadline] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    params.then(({ id }) => setProjectId(id));
  }, [params]);

  useEffect(() => {
    if (!projectId) return;

    async function loadProject() {
      setIsLoading(true);
      setError(null);
      const [projects, projectTasks] = await Promise.all([getProjects(), getProjectTasks(projectId)]);
      setProject(projects.find((item) => item.id === projectId) ?? null);
      setTasks(projectTasks);
      setIsLoading(false);
    }

    loadProject().catch((err: Error) => {
      setError(err.message);
      setIsLoading(false);
    });
  }, [projectId]);

  const maxHours = useMemo(
    () => Math.max(1, ...tasks.map((task) => Math.max(task.eta_hours, task.time_spent_hours))),
    [tasks],
  );

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !projectId) return;

    const task = await createTask({
      project_id: projectId,
      title: title.trim(),
      description: description.trim() || null,
      status,
      eta_hours: Number(eta) || 0,
      time_spent_hours: Number(spent) || 0,
      deadline: deadline ? new Date(deadline).toISOString() : null,
    });

    setTasks((current) => [task, ...current]);
    setTitle("");
    setDescription("");
    setEta("1");
    setSpent("0");
    setDeadline("");
    setStatus("todo");
  }

  async function handleStatusChange(taskId: string, nextStatus: TaskStatus) {
    const updated = await updateTask(taskId, { status: nextStatus });
    setTasks((current) => current.map((task) => (task.id === taskId ? updated : task)));
  }

  const totals = tasks.reduce(
    (acc, task) => ({
      eta: acc.eta + task.eta_hours,
      spent: acc.spent + task.time_spent_hours,
    }),
    { eta: 0, spent: 0 },
  );

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 md:py-12">
      <Link href="/" className="text-sm font-medium text-gray-500 hover:text-gray-950">
        Back to dashboard
      </Link>

      <header className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-gray-500">{project?.type ?? "Project"}</p>
          <h1 className="mt-2 text-3xl font-semibold text-gray-950 md:text-4xl">{project?.name ?? "Project detail"}</h1>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Planned vs Actual</p>
          <p className="mt-1 text-2xl font-semibold text-gray-950">
            {totals.eta.toFixed(1)}h / {totals.spent.toFixed(1)}h
          </p>
        </div>
      </header>

      {error ? <p className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}

      <section className="mt-8 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">Create Task</h2>
        <form onSubmit={handleCreateTask} className="mt-4 grid gap-3 md:grid-cols-6">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Task title"
            className="rounded-md border border-gray-200 px-3 py-2 outline-none ring-gray-900/10 focus:ring-4 md:col-span-2"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
            className="rounded-md border border-gray-200 px-3 py-2 outline-none ring-gray-900/10 focus:ring-4 md:col-span-2"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as TaskStatus)}
            className="rounded-md border border-gray-200 px-3 py-2 outline-none ring-gray-900/10 focus:ring-4"
          >
            <option value="todo">Todo</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
            <option value="delayed">Delayed</option>
          </select>
          <input
            type="date"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
            className="rounded-md border border-gray-200 px-3 py-2 outline-none ring-gray-900/10 focus:ring-4"
          />
          <input
            type="number"
            min="0"
            step="0.25"
            value={eta}
            onChange={(event) => setEta(event.target.value)}
            placeholder="ETA"
            className="rounded-md border border-gray-200 px-3 py-2 outline-none ring-gray-900/10 focus:ring-4"
          />
          <input
            type="number"
            min="0"
            step="0.25"
            value={spent}
            onChange={(event) => setSpent(event.target.value)}
            placeholder="Spent"
            className="rounded-md border border-gray-200 px-3 py-2 outline-none ring-gray-900/10 focus:ring-4"
          />
          <button className="rounded-md bg-gray-950 px-4 py-2 font-medium text-white hover:bg-gray-800 md:col-span-2">
            Add task
          </button>
        </form>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-950">Tasks</h2>
          <p className="text-sm text-gray-500">{tasks.length} total</p>
        </div>
        {isLoading ? <p className="rounded-lg bg-white p-6 text-gray-500 shadow-sm">Loading tasks...</p> : null}
        {!isLoading && tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
            Add your first task to see progress and timeline bars.
          </p>
        ) : null}
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="space-y-2">
              <TaskItem task={task} />
              <select
                value={task.status}
                onChange={(event) => handleStatusChange(task.id, event.target.value as TaskStatus)}
                className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none ring-gray-900/10 focus:ring-4"
              >
                <option value="todo">Todo</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
                <option value="delayed">Delayed</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-4 text-xl font-semibold text-gray-950">Timeline</h2>
        <div className="space-y-3">
          {tasks.map((task) => (
            <TimelineBar key={task.id} task={task} maxHours={maxHours} />
          ))}
        </div>
      </section>
    </main>
  );
}
