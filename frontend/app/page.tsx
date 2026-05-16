"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ProjectCard } from "@/components/ProjectCard";
import { createProject, getProjectTasks, getProjects, type Project, type ProjectType, type Task } from "@/lib/api";

type ProjectWithTasks = {
  project: Project;
  tasks: Task[];
};

export default function DashboardPage() {
  const [items, setItems] = useState<ProjectWithTasks[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<ProjectType>("fixed");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard() {
    setError(null);
    const projects = await getProjects();
    const taskGroups = await Promise.all(projects.map((project) => getProjectTasks(project.id)));
    setItems(projects.map((project, index) => ({ project, tasks: taskGroups[index] ?? [] })));
  }

  useEffect(() => {
    loadDashboard()
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const allTasks = items.flatMap((item) => item.tasks);
  const stats = useMemo(
    () => ({
      total: allTasks.length,
      completed: allTasks.filter((task) => task.status === "done").length,
      inProgress: allTasks.filter((task) => task.status === "in_progress").length,
      delayed: allTasks.filter((task) => task.status === "delayed").length,
      eta: allTasks.reduce((sum, task) => sum + task.eta_hours, 0),
      spent: allTasks.reduce((sum, task) => sum + task.time_spent_hours, 0),
    }),
    [allTasks],
  );

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;

    const project = await createProject({ name: name.trim(), type });
    setItems((current) => [{ project, tasks: [] }, ...current]);
    setName("");
    setType("fixed");
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 md:py-12">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-gray-500">Personal Execution Tracker</p>
          <h1 className="mt-2 text-3xl font-semibold text-gray-950 md:text-4xl">Projects and execution at a glance</h1>
        </div>
        <form onSubmit={handleCreateProject} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_150px_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New project name"
            className="rounded-md border border-gray-200 px-3 py-2 outline-none ring-gray-900/10 focus:ring-4"
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value as ProjectType)}
            className="rounded-md border border-gray-200 px-3 py-2 outline-none ring-gray-900/10 focus:ring-4"
          >
            <option value="fixed">Fixed</option>
            <option value="continuous">Continuous</option>
            <option value="study">Study</option>
          </select>
          <button className="rounded-md bg-gray-950 px-4 py-2 font-medium text-white hover:bg-gray-800">Create</button>
        </form>
      </header>

      {error ? <p className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}

      <section className="mt-8 grid gap-4 md:grid-cols-5">
        <Stat label="Total Tasks" value={stats.total} />
        <Stat label="Completed" value={stats.completed} />
        <Stat label="In Progress" value={stats.inProgress} />
        <Stat label="Delayed" value={stats.delayed} tone={stats.delayed > 0 ? "danger" : "default"} />
        <Stat label="Planned vs Actual" value={`${stats.eta.toFixed(1)}h / ${stats.spent.toFixed(1)}h`} />
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-950">Projects</h2>
          <p className="text-sm text-gray-500">{items.length} total</p>
        </div>

        {isLoading ? <p className="rounded-lg bg-white p-6 text-gray-500 shadow-sm">Loading projects...</p> : null}

        {!isLoading && items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
            Create your first project to start tracking execution.
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ProjectCard key={item.project.id} project={item.project} tasks={item.tasks} />
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "danger" }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone === "danger" ? "text-red-600" : "text-gray-950"}`}>{value}</p>
    </div>
  );
}
