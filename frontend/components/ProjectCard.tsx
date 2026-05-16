import Link from "next/link";
import type { Project, Task } from "@/lib/api";

type ProjectCardProps = {
  project: Project;
  tasks: Task[];
};

export function ProjectCard({ project, tasks }: ProjectCardProps) {
  const completed = tasks.filter((task) => task.status === "done").length;
  const delayed = tasks.filter((task) => task.status === "delayed").length;
  const progress = tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);

  return (
    <Link
      href={`/project/${project.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-950">{project.name}</h3>
          <p className="mt-1 text-sm capitalize text-gray-500">{project.type}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
          {progress}%
        </span>
      </div>

      <div className="mt-5 h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-500">Tasks</p>
          <p className="mt-1 font-semibold text-gray-950">{tasks.length}</p>
        </div>
        <div>
          <p className="text-gray-500">Delayed</p>
          <p className={delayed > 0 ? "mt-1 font-semibold text-red-600" : "mt-1 font-semibold text-gray-950"}>
            {delayed}
          </p>
        </div>
      </div>
    </Link>
  );
}
