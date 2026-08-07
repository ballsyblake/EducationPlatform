import Link from "next/link";
import { Badge, type Tone } from "@/components/ui";
import type { TaskItem, TaskState } from "@/lib/coursework";
import { formatDateTime, relativeDue } from "@/lib/format";

const STATE_LABEL: Record<TaskState, { label: string; tone: Tone }> = {
  not_started: { label: "Not started", tone: "muted" },
  in_progress: { label: "Draft saved", tone: "info" },
  submitted: { label: "Awaiting feedback", tone: "ok" },
  graded: { label: "Graded", tone: "good" },
};

export function TaskRow({ task }: { task: TaskItem }) {
  const state = STATE_LABEL[task.state];
  const due = relativeDue(task.dueAt);
  const showOverdue = due.overdue && task.state !== "graded" && task.state !== "submitted";

  return (
    <Link
      href={task.href}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-ink-50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge tone={task.kind === "quiz" ? "info" : "muted"}>
            {task.kind === "quiz" ? "Quiz" : "Assignment"}
          </Badge>
          <p className="truncate font-medium text-ink-900">{task.title}</p>
        </div>
        <p className="mt-1 text-xs text-ink-500">
          {task.courseTitle}
          {task.dueAt && <> · {formatDateTime(task.dueAt)}</>}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {showOverdue ? (
          <Badge tone="bad">{due.text}</Badge>
        ) : due.soon && task.state === "not_started" ? (
          <Badge tone="warn">{due.text}</Badge>
        ) : null}

        {task.state === "graded" && task.maxScore ? (
          <Badge tone="good">
            {task.score ?? 0}/{task.maxScore}
          </Badge>
        ) : (
          <Badge tone={state.tone}>{state.label}</Badge>
        )}

        {task.hasFeedback && <Badge tone="info">Feedback</Badge>}
      </div>
    </Link>
  );
}

export function TaskList({ tasks }: { tasks: TaskItem[] }) {
  return (
    <div className="card divide-y divide-ink-200">
      {tasks.map((task) => (
        <TaskRow key={`${task.kind}-${task.id}`} task={task} />
      ))}
    </div>
  );
}
