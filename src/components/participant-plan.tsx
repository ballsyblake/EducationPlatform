"use client";

import { Badge, type Tone } from "@/components/ui";
import type { RowPlan, RowPlanKind } from "@/lib/participants";

/**
 * What an import would do to each row of an export, as a table.
 *
 * Shared by the two ways in — importing onto a cohort that exists, and
 * creating one from the file. The thing being previewed is the same thing, and
 * two tables would drift into two different accounts of it.
 */
const KIND: Record<RowPlanKind, { label: string; tone: Tone }> = {
  create: { label: "New account", tone: "ok" },
  enroll: { label: "Enrol", tone: "ok" },
  update: { label: "Update", tone: "muted" },
  unchanged: { label: "Already right", tone: "good" },
  skip: { label: "Skipped", tone: "bad" },
};

export function truncate(text: string, at = 60) {
  return text.length > at ? `${text.slice(0, at)}…` : text;
}

export function PlanTable({ rows }: { rows: RowPlan[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
            <th className="py-2 pr-3 font-medium">Line</th>
            <th className="py-2 pr-3 font-medium">Name</th>
            <th className="py-2 pr-3 font-medium">Email</th>
            <th className="py-2 pr-3 font-medium">FA number</th>
            <th className="py-2 pr-3 font-medium">Age</th>
            <th className="py-2 font-medium">What happens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200">
          {rows.map((row) => (
            <tr key={row.line} className="align-top">
              <td className="py-2 pr-3 text-xs text-ink-500">{row.line}</td>
              <td className="py-2 pr-3 font-medium text-ink-900">{row.name ?? "—"}</td>
              <td className="py-2 pr-3 text-ink-600">{row.email ?? "—"}</td>
              <td className="py-2 pr-3 text-ink-600">{row.externalId ?? "—"}</td>
              <td className="py-2 pr-3 text-ink-600">{row.ageAtCourse ?? "—"}</td>
              <td className="py-2">
                <Badge tone={KIND[row.kind].tone}>{KIND[row.kind].label}</Badge>
                {row.matchedBy === "externalId" && (
                  <span className="ml-2 text-xs text-ink-500">matched on FA number</span>
                )}
                {(row.problems.length > 0 || row.notes.length > 0) && (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {row.problems.map((problem) => (
                      <li key={problem} className="text-red-700">
                        {problem}
                      </li>
                    ))}
                    {row.notes.map((note) => (
                      <li key={note} className="text-ink-500">
                        {note}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
