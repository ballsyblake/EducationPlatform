"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { PlanTable, truncate } from "@/components/participant-plan";
import { SubmitButton } from "@/components/submit-button";
import { FormError, FormSuccess } from "@/components/ui";
import { suggestCourse, type CourseSuggestion } from "@/lib/course-from-export";
import { parseParticipantCsv } from "@/lib/participant-csv";
import {
  createCourseFromExport,
  type NewCourseImportState,
} from "../../actions/new-course-import";

const initialState: NewCourseImportState = { status: "idle" };

/**
 * Choose an export, check what it says the course is, create it.
 *
 * The fields fill themselves from the file the moment it is chosen — the
 * `Courses` column for the qualification, the file name for the stream and the
 * venue — and every one of them is editable, because a file name is a weak
 * source that will be wrong eventually. Being wrong in a box somebody can
 * retype costs a keystroke; being wrong in a created course costs a cleanup.
 *
 * Dates and the course team are not here. Neither is in the export, and
 * nothing in this app invents a schedule: the days go on the register
 * afterwards, where their times decide what a day is worth.
 */
export function NewCourseForm() {
  const [state, formAction] = useActionState(createCourseFromExport, initialState);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<CourseSuggestion | null>(null);
  const [fields, setFields] = useState({
    title: "",
    qualification: "",
    stream: "",
    location: "",
    season: "",
    ratingThreshold: "2.5",
  });

  const plan = state.plan;
  const previewed = state.status === "previewed" && !!plan;
  const created = state.status === "ok" && !!state.course;

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);

    // The qualification comes from the file's own column where it has one; the
    // rest can only come from the name.
    const courseColumn = parseParticipantCsv(text).rows.find((row) => row.courses)?.courses;
    const guess = suggestCourse({ fileName: file.name, courseColumn });
    setSuggestion(guess);
    setFields({
      title: guess.title,
      qualification: guess.qualification ?? "",
      stream: guess.stream ?? "",
      location: guess.location ?? "",
      season: guess.season,
      ratingThreshold: "2.5",
    });
  }

  const set = (name: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [name]: value }));

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="csv" value={csv} />

        <div>
          <label className="label" htmlFor="export-file">
            Learning Centre export (.csv)
          </label>
          <input
            id="export-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-700 hover:file:bg-ink-200"
          />
          <p className="hint">
            The participant export, under the name the Learning Centre gives it — the file name
            is where the venue and the stream come from.
          </p>
        </div>

        {suggestion && (
          <div className="space-y-4 rounded-xl bg-ink-50 p-4">
            <div>
              <p className="section-title">From the file</p>
              <p className="text-xs text-ink-500">
                {fileName} · read as &ldquo;{suggestion.stem}&rdquo;. Everything below is a
                suggestion — change anything that isn&rsquo;t right before you create it.
                {suggestion.leftovers.length > 0 && (
                  <>
                    {" "}
                    The name also carries &ldquo;{suggestion.leftovers.join(" ")}&rdquo;, which
                    nothing here has a field for; put it in the title if it belongs there.
                  </>
                )}
              </p>
            </div>

            <div>
              <label className="label" htmlFor="course-title">
                Title
              </label>
              <input
                id="course-title"
                name="title"
                required
                value={fields.title}
                onChange={(e) => set("title")(e.target.value)}
                className="input"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="course-qualification">
                  Qualification
                </label>
                <input
                  id="course-qualification"
                  name="qualification"
                  value={fields.qualification}
                  onChange={(e) => set("qualification")(e.target.value)}
                  className="input"
                />
                <p className="hint">
                  What decides the coursework a coach on this cohort owes.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="course-season">
                  Season
                </label>
                <input
                  id="course-season"
                  name="season"
                  value={fields.season}
                  onChange={(e) => set("season")(e.target.value)}
                  className="input"
                />
                <p className="hint">Not in the export — this is just the current year.</p>
              </div>
              <div>
                <label className="label" htmlFor="course-stream">
                  Stream
                </label>
                <input
                  id="course-stream"
                  name="stream"
                  value={fields.stream}
                  onChange={(e) => set("stream")(e.target.value)}
                  placeholder="Metro or Regional"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="course-location">
                  Venue
                </label>
                <input
                  id="course-location"
                  name="location"
                  value={fields.location}
                  onChange={(e) => set("location")(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="course-pass-mark">
                  Pass mark
                </label>
                <input
                  id="course-pass-mark"
                  name="ratingThreshold"
                  type="number"
                  min={1}
                  max={5}
                  step={0.5}
                  value={fields.ratingThreshold}
                  onChange={(e) => set("ratingThreshold")(e.target.value)}
                  className="input"
                />
                <p className="hint">2.5 on every AFC/FA diploma. Blank if it isn&rsquo;t rated.</p>
              </div>
            </div>

            <p className="text-xs text-ink-500">
              The cohort is created unpublished, with no days and no course team: the export
              carries neither, and a schedule is not something to guess at. Add the days on the
              register and the team on the course page, then publish it.
            </p>
          </div>
        )}

        <FormError message={state.status === "error" ? state.message : null} />
        <FormSuccess message={state.status === "ok" ? state.message : null} />
        {previewed && <p className="text-sm text-ink-700">{state.message}</p>}

        {created && state.course && (
          <p className="text-sm">
            <Link
              href={`/admin/courses/${state.course.id}`}
              className="font-medium text-maroon-700 hover:underline"
            >
              Open {state.course.title}
            </Link>{" "}
            to add its days, its team and publish it.
          </p>
        )}

        {!created && (
          <div className="flex flex-wrap gap-2">
            <SubmitButton
              name="mode"
              value="preview"
              className="btn-secondary"
              pendingLabel="Reading…"
              disabled={!csv.trim()}
            >
              {previewed ? "Read it again" : "Preview"}
            </SubmitButton>
            {previewed && (
              <SubmitButton
                name="mode"
                value="commit"
                pendingLabel="Creating…"
                confirm={`Create "${fields.title}" and enrol ${
                  plan.counts.create + plan.counts.enroll
                } coaches on it?`}
              >
                Create the course and enrol them
              </SubmitButton>
            )}
          </div>
        )}
      </form>

      {plan && !plan.error && (
        <div className="space-y-4 border-t border-ink-200 pt-5">
          {plan.droppedColumns.length > 0 && (
            <p className="text-xs text-ink-500">
              Read but not stored: {plan.droppedColumns.join(", ")}. Nothing in the app has a
              place for them.
            </p>
          )}
          {plan.unknownColumns.length > 0 && (
            <p className="text-xs text-ink-500">
              Columns ignored: {plan.unknownColumns.map((c) => truncate(c)).join("; ")}.
            </p>
          )}
          <p className="text-xs text-ink-500">
            Ages stay blank until the cohort has days on its register — an age is an age on a
            day. Import the same file again afterwards and they fill in.
          </p>
          {plan.rows.length > 0 && <PlanTable rows={plan.rows} />}
        </div>
      )}
    </div>
  );
}
