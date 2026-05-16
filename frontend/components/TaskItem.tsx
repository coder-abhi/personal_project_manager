import type { Task, TaskStatus } from "@/lib/api";

const statusStyles: Record<TaskStatus, string> = {
  todo: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
  delayed: "bg-red-100 text-red-700",
};

export function TaskItem({ task }: { task: Task }) {
  const deadline = task.deadline ? new Date(task.deadline).toLocaleDateString() : "No deadline";
  const overrun = task.time_spent_hours - task.eta_hours;

  return (
    <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1.6fr_0.8fr_0.6fr_0.8fr_0.9fr] md:items-center">
      <div>
        <p className="font-medium text-gray-950">{task.title}</p>
        {task.description ? <p className="mt-1 text-sm text-gray-500">{task.description}</p> : null}
      </div>
      <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[task.status]}`}>
        {task.status.replace("_", " ")}
      </span>
      <p className="text-sm text-gray-700">{task.eta_hours}h ETA</p>
      <p className="text-sm text-gray-700">{task.time_spent_hours}h spent</p>
      <div className="text-sm">
        <p className={task.status === "delayed" ? "font-medium text-red-600" : "text-gray-700"}>{deadline}</p>
        {overrun > 0 ? <p className="mt-1 text-xs font-medium text-red-600">Overrun +{overrun.toFixed(1)}h</p> : null}
      </div>
    </div>
  );
}
