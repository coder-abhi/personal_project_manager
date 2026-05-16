import type { Task } from "@/lib/api";

export function TimelineBar({ task, maxHours }: { task: Task; maxHours: number }) {
  const plannedWidth = maxHours === 0 ? 0 : Math.max((task.eta_hours / maxHours) * 100, task.eta_hours > 0 ? 4 : 0);
  const actualWidth =
    maxHours === 0 ? 0 : Math.max((task.time_spent_hours / maxHours) * 100, task.time_spent_hours > 0 ? 4 : 0);
  const isOverrun = task.time_spent_hours > task.eta_hours;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="truncate font-medium text-gray-950">{task.title}</p>
        <p className="shrink-0 text-sm text-gray-500">
          {task.eta_hours}h / {task.time_spent_hours}h
        </p>
      </div>
      <div className="space-y-2">
        <div>
          <div className="mb-1 flex justify-between text-xs text-gray-500">
            <span>Planned</span>
            <span>{task.eta_hours}h</span>
          </div>
          <div className="h-3 rounded-full bg-gray-100">
            <div className="h-3 rounded-full bg-gray-900" style={{ width: `${plannedWidth}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-gray-500">
            <span>Actual</span>
            <span>{task.time_spent_hours}h</span>
          </div>
          <div className="h-3 rounded-full bg-gray-100">
            <div className={`h-3 rounded-full ${isOverrun ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${actualWidth}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
