"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useMutation } from "convex/react";

import {
  calculatePace,
  compareIsoDates,
  flattenEntryNotes,
  formatMiles,
  getChartData,
  getDayOfYear,
  getLongDate,
  getMonthMatrix,
  getMonthName,
  getProgressSummary,
  getRequiredMiles,
  getShortDate,
  getStatusTone,
  getWeeklySummary,
  getYearlySummary,
  paceStringToSeconds,
  parseIsoDate,
  secondsToPaceString,
  secondsToTimeString,
  timeStringToSeconds,
} from "@/lib/challenge";
import { StravaSyncPreviewModal } from "@/components/strava-log-upload-card";
import { api } from "@/convex/_generated/api";
import { useTracker } from "@/components/tracker-provider";
import { authClient } from "@/lib/auth-client";
import type { ChecklistItem, RunEntry, RunSegment } from "@/lib/types";

type StravaSyncPreviewItem = {
  id: string;
  name: string;
  date: string;
  actualMiles: number;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function InfoHint({
  text,
  tone = "light",
}: {
  text: string;
  tone?: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex items-center group">
      <button
        type="button"
        aria-label="More information"
        onClick={() => setOpen((current) => !current)}
        onBlur={() => setOpen(false)}
        className={cx(
          "inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold transition",
          tone === "light" &&
            "border-[var(--line-strong)] text-[var(--muted)] hover:border-[var(--blue)] hover:text-[var(--blue)]",
          tone === "dark" &&
            "border-white/30 text-white/80 hover:border-white/60 hover:text-white",
        )}
      >
        i
      </button>
      <div
        className={cx(
          "pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-52 -translate-x-1/2 rounded-2xl px-3 py-2 text-xs leading-5 shadow-lg transition",
          tone === "light" && "border border-[var(--line)] bg-white text-[var(--ink)]",
          tone === "dark" && "border border-white/15 bg-[rgba(17,24,39,0.92)] text-white",
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        {text}
      </div>
    </div>
  );
}

function surface(
  title: string,
  value: string,
  helper?: string,
  tone: "light" | "dark" = "light",
  helperMode: "text" | "info" = "text",
) {
  return (
    <article
      className={cx(
        "rounded-[28px] p-5",
        tone === "light" &&
          "border border-[var(--line)] bg-white shadow-[0_18px_45px_rgba(32,44,37,0.08)]",
        tone === "dark" &&
          "border border-[var(--hero-line)] bg-[var(--hero-card)] backdrop-blur-sm",
      )}
    >
      <div className="flex items-center gap-2">
        <p
          className={cx(
            "text-sm uppercase tracking-[0.18em]",
            tone === "light" ? "text-[var(--muted)]" : "text-[var(--hero-muted)]",
          )}
        >
          {title}
        </p>
        {helper && helperMode === "info" ? <InfoHint text={helper} tone={tone} /> : null}
      </div>
      <p
        className={cx(
          "mt-3 text-3xl font-semibold tracking-tight",
          tone === "light" ? "text-[var(--ink)]" : "text-white",
        )}
      >
        {value}
      </p>
      {helper && helperMode === "text" ? (
        <p
          className={cx(
            "mt-2 text-sm",
            tone === "light" ? "text-[var(--muted)]" : "text-[var(--hero-muted)]",
          )}
        >
          {helper}
        </p>
      ) : null}
    </article>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">{eyebrow}</p>
        <h2 className="mt-2 font-display text-3xl tracking-tight text-[var(--ink)]">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{body}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-[30px] border border-dashed border-[var(--line)] bg-white/70 p-8 text-center">
      <h3 className="font-display text-2xl tracking-tight text-[var(--ink)]">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function StatusPill({ tone, label }: { tone: "complete" | "partial" | "missed" | "future"; label: string }) {
  return (
    <span
      className={cx(
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        tone === "complete" && "bg-[var(--green-soft)] text-[var(--green-strong)]",
        tone === "partial" && "bg-[var(--yellow-soft)] text-[var(--yellow-strong)]",
        tone === "missed" && "bg-[var(--red-soft)] text-[var(--red-strong)]",
        tone === "future" && "bg-[var(--slate-soft)] text-[var(--muted)]",
      )}
    >
      {label}
    </span>
  );
}

function ProgressBar({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  tone: "green" | "blue";
}) {
  return (
    <div className="rounded-[28px] border border-[var(--line)] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">{label}</p>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{helper}</p>
        </div>
        <span className="text-2xl font-semibold text-[var(--ink)]">{value.toFixed(2)}%</span>
      </div>
      <div className="mt-4 h-3 rounded-full bg-[var(--slate-soft)]">
        <div
          className={cx(
            "h-3 rounded-full transition-all",
            tone === "green" ? "bg-[var(--green)]" : "bg-[var(--blue)]",
          )}
          style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
        />
      </div>
    </div>
  );
}

function FilePicker({
  label,
  onPick,
  multiple = false,
}: {
  label: string;
  onPick: (files: string[]) => void;
  multiple?: boolean;
}) {
  return (
    <label className="flex cursor-pointer flex-col gap-2 rounded-[20px] border border-dashed border-[var(--line)] px-4 py-5 text-sm text-[var(--muted)] transition hover:border-[var(--blue)] hover:text-[var(--blue)]">
      <span className="font-medium text-[var(--ink)]">{label}</span>
      <span>{multiple ? "Upload up to ten files." : "Upload a single image."}</span>
      <input
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={async (event) => {
          const fileList = Array.from(event.target.files ?? []);
          const data = await Promise.all(
            fileList.slice(0, multiple ? 10 : 1).map(
              (file) =>
                new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result ?? ""));
                  reader.readAsDataURL(file);
                }),
            ),
          );
          onPick(data.filter(Boolean));
        }}
      />
    </label>
  );
}

function MetricGrid({ entry }: { entry: RunEntry }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {surface("Actual miles", `${formatMiles(entry.actualMiles)} mi`)}
      {surface("Total time", secondsToTimeString(entry.totalTimeSeconds))}
      {surface("Average pace", `${secondsToPaceString(entry.avgPaceSeconds)} /mi`)}
      {surface("Elevation gain", entry.elevationGain ? `${entry.elevationGain} ft` : "--")}
    </div>
  );
}

function CalendarMonth({
  year,
  month,
  entries,
  todayIso,
}: {
  year: number;
  month: number;
  entries: RunEntry[];
  todayIso: string;
}) {
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const weeks = getMonthMatrix(year, month);
  return (
    <div className="rounded-[30px] border border-[var(--line)] bg-white p-3 shadow-[0_18px_45px_rgba(32,44,37,0.06)] lg:p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-2xl tracking-tight text-[var(--ink)]">{getMonthName(month)}</h3>
          <p className="text-sm text-[var(--muted)]">{year} challenge view</p>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] lg:gap-2 lg:text-xs lg:tracking-[0.18em]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="py-1.5 lg:py-2">
            {day}
          </div>
        ))}
      </div>
      <div className="grid gap-1 lg:gap-2">
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 gap-1 lg:gap-2">
            {week.map((date) => {
              const entry = byDate.get(date);
              const state = getStatusTone(date, entry, todayIso);
              const stateLabel =
                date === todayIso && !entry?.completed ? "today" : state;
              const sameMonth = parseIsoDate(date).getMonth() + 1 === month;
              const sameYear = parseIsoDate(date).getFullYear() === year;
              const thumb = entry?.media[0];
              const recoveryChecked = Boolean(
                entry?.checklistItems.find(
                  (item) => item.label === "Recovery" && item.completed,
                ),
              );
              return (
                <Link
                  key={date}
                  href={`/log/${date}`}
                  className={cx(
                    "group relative min-h-[84px] rounded-[18px] border p-2 text-left transition lg:min-h-[110px] lg:rounded-[22px] lg:p-3",
                    !sameYear && "border-[var(--line)] bg-[var(--slate-soft)]",
                    sameYear && state === "complete" && "border-transparent bg-[var(--green-soft)]",
                    sameYear && state === "partial" && "border-transparent bg-[var(--yellow-soft)]",
                    sameYear && state === "missed" && "border-transparent bg-[var(--red-soft)]",
                    sameYear && state === "future" && "border-[var(--line)] bg-[var(--slate-soft)]",
                    date === todayIso && "ring-2 ring-[var(--blue)] ring-offset-2 ring-offset-[var(--page-bg)]",
                    !sameMonth && "opacity-45",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--ink)] lg:text-sm">
                      {parseIsoDate(date).getDate()}
                    </span>
                    {!sameYear ? null : entry?.completed ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--green)] text-[10px] font-semibold text-white lg:h-7 lg:w-7 lg:text-sm">
                        ✓
                      </span>
                    ) : (
                      <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--muted)] lg:text-[11px] lg:tracking-[0.18em]">
                        {stateLabel}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-semibold tracking-tight text-[var(--ink)] lg:mt-4 lg:text-lg">
                    {!sameYear
                      ? "--"
                      : entry
                        ? formatMiles(entry.actualMiles)
                        : formatMiles(getRequiredMiles(date))}
                  </p>
                  <p className="text-[10px] text-[var(--muted)] lg:text-xs">
                    {!sameYear ? "" : entry ? "logged miles" : "required miles"}
                  </p>
                  {sameYear && recoveryChecked ? (
                    <span className="absolute bottom-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--red-strong)] text-[10px] font-semibold text-white lg:bottom-3 lg:right-3 lg:h-6 lg:w-6 lg:text-xs">
                      R
                    </span>
                  ) : null}
                  {sameYear && thumb ? (
                    <Image
                      alt={thumb.name}
                      src={thumb.url}
                      width={320}
                      height={64}
                      unoptimized
                      className="mt-2 h-5 w-full rounded-md object-cover opacity-90 transition group-hover:opacity-100 lg:mt-3 lg:h-8 lg:rounded-xl"
                    />
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function PolylineChart({
  title,
  subtitle,
  actual,
  required,
  todayX,
}: {
  title: string;
  subtitle: string;
  actual: { dayOfYear: number; miles: number }[];
  required: { dayOfYear: number; miles: number }[];
  todayX: number;
}) {
  const width = 860;
  const height = 320;
  const padding = 36;
  const maxY = Math.max(...required.map((point) => point.miles), ...actual.map((point) => point.miles), 1);
  const x = (value: number) => padding + ((width - padding * 2) * (value - 1)) / 364;
  const y = (value: number) => height - padding - ((height - padding * 2) * value) / maxY;
  const line = (points: { dayOfYear: number; miles: number }[]) =>
    points.map((point) => `${x(point.dayOfYear)},${y(point.miles)}`).join(" ");
  const area = [
    `${x(actual[0].dayOfYear)},${height - padding}`,
    ...actual.map((point) => `${x(point.dayOfYear)},${y(point.miles)}`),
    `${x(actual[actual.length - 1].dayOfYear)},${height - padding}`,
  ].join(" ");

  return (
    <div className="rounded-[30px] border border-[var(--line)] bg-white p-5">
      <div className="mb-4">
        <h3 className="font-display text-2xl tracking-tight text-[var(--ink)]">{title}</h3>
        <p className="text-sm text-[var(--muted)]">{subtitle}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <path d={`M ${padding} ${height - padding} H ${width - padding}`} stroke="var(--line-strong)" strokeWidth="1" />
        <path d={`M ${padding} ${padding} V ${height - padding}`} stroke="var(--line-strong)" strokeWidth="1" />
        <polygon points={area} fill="rgba(53, 124, 102, 0.12)" />
        <polyline fill="none" stroke="var(--blue)" strokeWidth="4" points={line(actual)} />
        <polyline fill="none" stroke="var(--ink)" strokeWidth="3" strokeDasharray="10 10" points={line(required)} />
        <line x1={x(todayX)} x2={x(todayX)} y1={padding} y2={height - padding} stroke="var(--red-strong)" strokeDasharray="6 8" />
      </svg>
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-[var(--muted)]">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[var(--blue)]" />Actual miles</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[var(--ink)]" />Required miles</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[var(--red-strong)]" />Today marker</span>
      </div>
    </div>
  );
}

function PaceChart({
  points,
}: {
  points: { date: string; paceSeconds: number; miles: number }[];
}) {
  const width = 860;
  const height = 280;
  const padding = 36;
  const min = Math.min(...points.map((point) => point.paceSeconds));
  const max = Math.max(...points.map((point) => point.paceSeconds), min + 1);
  const x = (index: number) =>
    padding + ((width - padding * 2) * index) / Math.max(points.length - 1, 1);
  const y = (value: number) =>
    padding + ((height - padding * 2) * (value - min)) / Math.max(max - min, 1);
  const line = points.map((point, index) => `${x(index)},${y(point.paceSeconds)}`).join(" ");
  return (
    <div className="rounded-[30px] border border-[var(--line)] bg-white p-5">
      <div className="mb-4">
        <h3 className="font-display text-2xl tracking-tight text-[var(--ink)]">Pace trend</h3>
        <p className="text-sm text-[var(--muted)]">Lower values are faster. The chart is inverted from the usual race-day mental model.</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <path d={`M ${padding} ${padding} V ${height - padding} H ${width - padding}`} stroke="var(--line-strong)" strokeWidth="1" fill="none" />
        <polyline fill="none" stroke="var(--yellow-strong)" strokeWidth="4" points={line} />
        {points.map((point, index) => (
          <circle key={point.date} cx={x(index)} cy={y(point.paceSeconds)} r="4.5" fill="var(--ink)" />
        ))}
      </svg>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {points.slice(-3).map((point) => (
          <div key={point.date} className="rounded-[20px] bg-[var(--slate-soft)] px-4 py-3 text-sm">
            <p className="font-semibold text-[var(--ink)]">{getShortDate(point.date)}</p>
            <p className="text-[var(--muted)]">{secondsToPaceString(point.paceSeconds)} /mi across {formatMiles(point.miles)} miles</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogForm({
  date,
  entry,
  run,
  onSaved,
  submitLabel = "Save run entry",
}: {
  date: string;
  entry?: RunEntry;
  run?: RunSegment;
  onSaved?: () => void;
  submitLabel?: string;
}) {
  const { todayIso, upsertRunEntry } = useTracker();
  const [assignedDate, setAssignedDate] = useState(run?.assignedDate ?? date);
  const [actualMiles, setActualMiles] = useState(run?.actualMiles ? String(run.actualMiles) : "");
  const [totalTime, setTotalTime] = useState(run?.totalTimeSeconds ? secondsToTimeString(run.totalTimeSeconds) : "");
  const [pace, setPace] = useState(run?.avgPaceSeconds ? secondsToPaceString(run.avgPaceSeconds) : "");
  const [elevationGain, setElevationGain] = useState(run?.elevationGain ? String(run.elevationGain) : "");
  const [notes, setNotes] = useState(run?.notes ?? "");
  const [completedMode, setCompletedMode] = useState<"auto" | "complete" | "incomplete">(
    typeof entry?.completedOverride === "boolean"
      ? entry.completedOverride
        ? "complete"
        : "incomplete"
      : "auto",
  );
  const [recoveryCompleted, setRecoveryCompleted] = useState(
    entry?.checklistItems.find((item) => item.label === "Recovery")?.completed ?? false,
  );
  const [showSplits, setShowSplits] = useState(Boolean(run?.splits.length));
  const [splits, setSplits] = useState<Array<{ id: string; mileNumber: number; pace: string }>>(() =>
    run?.splits.length
      ? run.splits.map((split) => ({ ...split, pace: secondsToPaceString(split.paceSeconds) }))
      : [],
  );

  function applyAutoFields(nextMilesText: string, nextTimeText: string) {
    const miles = Number(nextMilesText);
    const seconds = timeStringToSeconds(nextTimeText);
    if (!(miles > 0 && seconds)) return;
    setPace(secondsToPaceString(calculatePace(miles, seconds)));
    setSplits((current) => {
      const length = Math.max(current.length, Math.ceil(miles));
      return Array.from({ length }, (_, index) => ({
        id: current[index]?.id ?? `${date}-split-${index + 1}`,
        mileNumber: index + 1,
        pace:
          current[index]?.pace ??
          secondsToPaceString(calculatePace(miles, seconds) + index * 2),
      }));
    });
  }

  return (
    <form
      className="space-y-5 rounded-[30px] border border-[var(--line)] bg-white p-6"
      onSubmit={(event) => {
        event.preventDefault();
        const miles = Number(actualMiles);
        if (!miles && miles !== 0) return;
        const totalTimeSeconds = totalTime ? timeStringToSeconds(totalTime) : undefined;
        const avgPaceSeconds = pace ? paceStringToSeconds(pace) : undefined;
        upsertRunEntry({
          runId: run?.id,
          date: assignedDate,
          actualMiles: miles,
          totalTimeSeconds,
          avgPaceSeconds,
          elevationGain: elevationGain ? Number(elevationGain) : undefined,
          notes,
          completedOverride:
            completedMode === "auto"
              ? undefined
              : completedMode === "complete",
          splits: splits
            .filter((split) => split.pace)
            .map((split) => ({
              id: split.id,
              mileNumber: split.mileNumber,
              paceSeconds: paceStringToSeconds(split.pace) ?? 0,
            })),
          startedAt: run?.startedAt,
          source: run?.source ?? "manual",
          stravaActivityId: run?.stravaActivityId,
          recoveryCompleted,
        });
        onSaved?.();
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm text-[var(--muted)]">
          <span>Count this run toward</span>
          <input
            type="date"
            value={assignedDate}
            onChange={(event) => setAssignedDate(event.target.value)}
            className="field"
            max={todayIso}
          />
        </label>
        <label className="space-y-2 text-sm text-[var(--muted)]">
          <span>Actual miles</span>
          <input
            value={actualMiles}
            onChange={(event) => {
              const nextValue = event.target.value;
              setActualMiles(nextValue);
              applyAutoFields(nextValue, totalTime);
            }}
            required
            className="field"
            inputMode="decimal"
          />
        </label>
        <label className="space-y-2 text-sm text-[var(--muted)]">
          <span>Total time</span>
          <input
            value={totalTime}
            onChange={(event) => {
              const nextValue = event.target.value;
              setTotalTime(nextValue);
              applyAutoFields(actualMiles, nextValue);
            }}
            placeholder="hh:mm:ss"
            className="field"
          />
        </label>
        <label className="space-y-2 text-sm text-[var(--muted)]">
          <span>Average pace</span>
          <input value={pace} onChange={(event) => setPace(event.target.value)} placeholder="mm:ss" className="field" />
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">(auto)</p>
        </label>
        <label className="space-y-2 text-sm text-[var(--muted)]">
          <span>Elevation gain</span>
          <input value={elevationGain} onChange={(event) => setElevationGain(event.target.value)} className="field" inputMode="numeric" />
        </label>
      </div>

      <label className="space-y-2 text-sm text-[var(--muted)]">
        <span>Completion status</span>
        <select value={completedMode} onChange={(event) => setCompletedMode(event.target.value as "auto" | "complete" | "incomplete")} className="field">
          <option value="auto">Auto-calculate from mileage</option>
          <option value="complete">Force complete</option>
          <option value="incomplete">Force incomplete</option>
        </select>
      </label>

      <label className="space-y-2 text-sm text-[var(--muted)]">
        <span>Notes</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} className="field min-h-28" />
      </label>

      <label className="flex items-center gap-3 rounded-[20px] bg-[var(--slate-soft)] px-4 py-3 text-sm text-[var(--ink)]">
        <input
          type="checkbox"
          checked={recoveryCompleted}
          onChange={(event) => setRecoveryCompleted(event.target.checked)}
        />
        <span className="font-medium">Recovery</span>
      </label>

      <div className="rounded-[24px] bg-[var(--slate-soft)] p-4">
        <button type="button" onClick={() => setShowSplits((current) => !current)} className="text-sm font-semibold text-[var(--ink)]">
          {showSplits ? "Hide" : "Show"} splits
        </button>
        {showSplits ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {splits.map((split, index) => (
              <label key={split.id} className="space-y-2 text-sm text-[var(--muted)]">
                <span>Mile {index + 1} pace</span>
                <input
                  value={split.pace}
                  onChange={(event) =>
                    setSplits((current) =>
                      current.map((item) =>
                        item.id === split.id ? { ...item, pace: event.target.value } : item,
                      ),
                    )
                  }
                  className="field"
                  placeholder="mm:ss"
                />
              </label>
            ))}
          </div>
        ) : null}
      </div>

      <button type="submit" disabled={!actualMiles} className="btn btn-primary">
        {submitLabel}
      </button>
    </form>
  );
}

function ChecklistEditor({ date, entry }: { date: string; entry: RunEntry }) {
  const { replaceChecklist, toggleChecklistItem } = useTracker();
  const [customItem, setCustomItem] = useState("");

  return (
    <div className="rounded-[30px] border border-[var(--line)] bg-white p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl tracking-tight text-[var(--ink)]">Checklist</h3>
          <p className="text-sm text-[var(--muted)]">
            Run completed syncs automatically with the entry status. Recovery can be adjusted here if needed.
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {entry.checklistItems.map((item) => (
          <label key={item.id} className="flex items-center gap-3 rounded-[20px] bg-[var(--slate-soft)] px-4 py-3">
            <input
              type="checkbox"
              checked={item.completed}
              disabled={item.label === "Run completed"}
              onChange={(event) => {
                toggleChecklistItem(date, item.id, event.target.checked);
              }}
            />
            <span className="font-medium text-[var(--ink)]">{item.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input value={customItem} onChange={(event) => setCustomItem(event.target.value)} className="field flex-1" placeholder="Add a custom checklist item" />
        <button
          type="button"
          onClick={() => {
            if (!customItem.trim()) return;
            const next: ChecklistItem[] = [
              ...entry.checklistItems,
              {
                id: `${date}-${customItem}-${Date.now()}`,
                label: customItem.trim(),
                completed: false,
                order: entry.checklistItems.length,
              },
            ];
            replaceChecklist(date, next);
            setCustomItem("");
          }}
          className="btn btn-secondary"
        >
          Add item
        </button>
      </div>
    </div>
  );
}

function MediaManager({ date, entry }: { date: string; entry: RunEntry }) {
  const { deleteMedia, saveMedia } = useTracker();
  const photos = entry.media.filter((item) => item.type === "photo");
  const map = entry.media.find((item) => item.type === "map");
  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-[30px] border border-[var(--line)] bg-white p-6">
        <h3 className="font-display text-2xl tracking-tight text-[var(--ink)]">Map screenshot</h3>
        <p className="mt-2 text-sm text-[var(--muted)]">Single featured map image for the day detail header.</p>
        {map ? (
          <div className="mt-5 overflow-hidden rounded-[24px]">
            <Image
              src={map.url}
              alt={map.name}
              width={960}
              height={512}
              unoptimized
              className="h-64 w-full object-cover"
            />
            <button type="button" onClick={() => deleteMedia(date, map.id)} className="btn btn-secondary mt-4">
              Delete map
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <FilePicker
              label="Upload map image"
              onPick={(files) => {
                const url = files[0];
                if (!url) return;
                saveMedia(date, {
                  id: `${date}-map-${Date.now()}`,
                  type: "map",
                  url,
                  name: "Map upload",
                  order: 0,
                  createdAt: Date.now(),
                });
              }}
            />
          </div>
        )}
      </div>
      <div className="rounded-[30px] border border-[var(--line)] bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl tracking-tight text-[var(--ink)]">Photos</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">Scrollable run-day gallery. Max ten images.</p>
          </div>
          <span className="rounded-full bg-[var(--slate-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            {photos.length}/10
          </span>
        </div>
        <div className="mt-5 flex gap-4 overflow-x-auto pb-3">
          {photos.map((photo) => (
            <div key={photo.id} className="min-w-44 rounded-[24px] bg-[var(--slate-soft)] p-3">
              <Image
                src={photo.url}
                alt={photo.name}
                width={320}
                height={240}
                unoptimized
                className="h-32 w-full rounded-[18px] object-cover"
              />
              <button type="button" onClick={() => deleteMedia(date, photo.id)} className="btn btn-ghost mt-3 px-0 py-0">
                Delete
              </button>
            </div>
          ))}
        </div>
        {photos.length < 10 ? (
          <div className="mt-4">
            <FilePicker
              label="Upload photos"
              multiple
              onPick={(files) => {
                files.slice(0, 10 - photos.length).forEach((url, index) => {
                  saveMedia(date, {
                    id: `${date}-photo-${Date.now()}-${index}`,
                    type: "photo",
                    url,
                    name: `Run photo ${photos.length + index + 1}`,
                    order: photos.length + index + 1,
                    createdAt: Date.now(),
                  });
                });
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { markMilestoneSeen, ready, store, todayIso } = useTracker();
  const todayEntry = store.runEntries.find((entry) => entry.date === todayIso);
  const yearEntries = store.runEntries.filter(
    (entry) => parseIsoDate(entry.date).getFullYear() === store.settings.year,
  );
  const progress = getProgressSummary(
    yearEntries,
    store.settings.year,
    store.settings.challengeStartDate,
  );
  const weekly = getWeeklySummary(yearEntries);
  const milestoneDays = Math.floor(progress.completedDays / 50) * 50;
  const shouldShowMilestone =
    milestoneDays >= 50 && milestoneDays > (store.lastShownMilestone ?? 0);

  if (!ready) {
    return <EmptyState title="Loading tracker" body="Preparing the challenge data and saved entries." />;
  }

  return (
    <div className="space-y-8">
      {shouldShowMilestone ? (
        <section className="rounded-[30px] border border-[#f0d58a] bg-[linear-gradient(135deg,#fff7d6_0%,#f5e1a4_100%)] p-6 shadow-[0_18px_45px_rgba(169,124,27,0.14)]">
          <p className="text-xs uppercase tracking-[0.28em] text-[#8b6414]">Milestone</p>
          <h2 className="mt-2 font-display text-3xl tracking-tight text-[#5f4310]">
            Congratulations on reaching {milestoneDays} days of consistent running.
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#7b5a17]">
            You&apos;ve cleared another major checkpoint in the Run the Day challenge.
          </p>
          <div className="mt-5">
            <button
              type="button"
              onClick={() => markMilestoneSeen(milestoneDays)}
              className="btn border border-[#c39a38] bg-white/70 px-4 py-2 text-[#6d4e10] hover:bg-white"
            >
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[4fr_1fr]">
        <div className="rounded-[34px] bg-[linear-gradient(135deg,#16324f_0%,#247ba0_58%,#70c1b3_100%)] p-7 text-white shadow-[0_30px_80px_rgba(22,50,79,0.24)]">
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-4xl tracking-tight sm:text-5xl">{getLongDate(todayIso)}</h1>
                <span className="rounded-full border border-[var(--hero-line)] bg-[var(--hero-card)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/88">
                  Day {getDayOfYear(todayIso)}
                </span>
              </div>
              <p className="mt-3 text-lg text-white/85">
                Required mileage: <span className="font-semibold">{formatMiles(getRequiredMiles(todayIso))} miles</span>
              </p>
            </div>
            <StatusPill
              tone={getStatusTone(todayIso, todayEntry, todayIso)}
              label={
                todayEntry?.completed
                  ? "Completed"
                  : todayEntry
                    ? "Partial"
                    : "Not logged"
              }
            />
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {surface(
              "Completed days",
              `${progress.completedDays}/${progress.totalDaysInYear}`,
              "Completed across the full challenge year",
              "dark",
              "info",
            )}
            {surface(
              "Surplus / deficit",
              `${progress.surplusDeficitMiles >= 0 ? "+" : ""}${formatMiles(progress.surplusDeficitMiles)} mi`,
              "Excludes today's unmet mileage until tomorrow",
              "dark",
              "info",
            )}
            {surface(
              "Current streak",
              `${progress.currentStreak}`,
              "Gap today does not break until tomorrow",
              "dark",
              "info",
            )}
          </div>
        </div>

        <div className="flex h-full flex-col rounded-[34px] border border-[var(--line)] bg-white p-6 shadow-[0_24px_50px_rgba(32,44,37,0.07)]">
          <h3 className="font-display text-2xl tracking-tight text-[var(--ink)]">Catch-up alert</h3>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {progress.missedDates.length
              ? `${progress.missedDates.length} missed days are contributing ${formatMiles(progress.catchUpDeficitMiles)} deficit miles.`
              : "No missed days are currently dragging down the challenge."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {progress.missedDates.slice(0, 4).map((date) => (
              <Link key={date} href={`/log/${date}`} className="btn btn-soft-danger px-3 py-2">
                {getShortDate(date)}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <h2 className="font-display text-4xl tracking-tight text-[var(--ink)]">Progress</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <ProgressBar
              label="Days completed"
              helper={`${progress.completedDays} of ${progress.totalDaysInYear}`}
              value={progress.totalDaysInYear ? (progress.completedDays / progress.totalDaysInYear) * 100 : 0}
              tone="green"
            />
            <ProgressBar
              label="Miles completed"
              helper={`${formatMiles(progress.creditedMiles)} of ${formatMiles(progress.totalRequiredFullYear)} annual miles`}
              value={(progress.creditedMiles / progress.totalRequiredFullYear) * 100}
              tone="blue"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {surface("Longest streak", `${progress.longestStreak} days`)}
            {surface("Missed days", `${progress.missedDays}`)}
          </div>
        </div>

        <div className="space-y-6">
          <details open className="rounded-[30px] border border-[var(--line)] bg-white p-6">
            <summary className="cursor-pointer list-none font-display text-2xl tracking-tight text-[var(--ink)]">
              Weekly summary
            </summary>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {surface("Days run", `${weekly.daysRun}/7`, `${getShortDate(weekly.weekStart)} to ${getShortDate(weekly.weekEnd)}`)}
              {surface("Miles this week", `${formatMiles(weekly.creditedMiles)} / ${formatMiles(weekly.requiredMiles)} mi`, "Completed versus required")}
              {surface("Average pace", weekly.avgPaceSeconds ? `${secondsToPaceString(weekly.avgPaceSeconds)} /mi` : "--", "Only entries with pace count")}
              {surface("Completion rate", `${Math.round(weekly.completionRate)}%`, "Weekly challenge hit rate")}
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}

export function CalendarPage() {
  const { ready, store, todayIso } = useTracker();
  const [month, setMonth] = useState(parseIsoDate(todayIso).getMonth() + 1);
  const entries = store.runEntries.filter(
    (entry) => parseIsoDate(entry.date).getFullYear() === store.settings.year,
  );
  if (!ready) {
    return <EmptyState title="Loading calendar" body="Preparing the month view and day cells." />;
  }
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-4xl tracking-tight text-[var(--ink)]">Calendar</h1>
        <div className="flex gap-3">
          <button type="button" onClick={() => setMonth((current) => (current === 1 ? 12 : current - 1))} className="btn btn-secondary">
            Prev
          </button>
          <button type="button" onClick={() => setMonth((current) => (current === 12 ? 1 : current + 1))} className="btn btn-secondary">
            Next
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[740px] 2xl:min-w-0">
          <CalendarMonth year={store.settings.year} month={month} entries={entries} todayIso={todayIso} />
        </div>
      </div>
    </div>
  );
}

export function ProgressPage() {
  const { ready, store, todayIso } = useTracker();
  const [targetDate, setTargetDate] = useState(todayIso);
  const [paceScope, setPaceScope] = useState<"30" | "full">("30");
  const entries = store.runEntries.filter(
    (entry) => parseIsoDate(entry.date).getFullYear() === store.settings.year,
  );
  const progress = getProgressSummary(
    entries,
    store.settings.year,
    store.settings.challengeStartDate,
  );
  const chartData = getChartData(entries, store.settings.year);
  const pacePoints =
    paceScope === "30" ? chartData.paceTrend.slice(-30) : chartData.paceTrend;
  const daysUntilTarget = Math.max(
    Math.ceil((parseIsoDate(targetDate).getTime() - parseIsoDate(todayIso).getTime()) / 86_400_000),
    1,
  );
  const makeupPerDay = progress.surplusDeficitMiles < 0 ? Math.abs(progress.surplusDeficitMiles) / daysUntilTarget : 0;

  if (!ready) {
    return <EmptyState title="Loading progress" body="Preparing the progress charts and cumulative challenge metrics." />;
  }

  return (
    <div className="space-y-8">
      <SectionHeader eyebrow="Progress" title="Numbers with context" body="The challenge only makes sense when days completed, required miles, streaks, and catch-up math are visible together." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {surface("Days completed", `${progress.completedDays}/${progress.totalDaysInYear}`, `${Math.round((progress.completedDays / Math.max(progress.totalDaysInYear, 1)) * 100)}% of challenge year`)}
        {surface("Days missed", `${progress.missedDays}`, "Includes incomplete logged days")}
        {surface("Total miles logged", `${formatMiles(progress.totalLogged)} mi`, `${formatMiles(progress.totalRequired)} required to date`)}
        {surface("Surplus / deficit", `${progress.surplusDeficitMiles >= 0 ? "+" : ""}${formatMiles(progress.surplusDeficitMiles)} mi`, "Based on past required miles only")}
      </div>
      <PolylineChart title="Cumulative miles" subtitle="Actual miles versus required miles across the challenge year." actual={chartData.cumulativeActual} required={chartData.cumulativeRequired} todayX={getDayOfYear(todayIso)} />
      <div className="flex gap-3">
        <button type="button" onClick={() => setPaceScope("30")} className={cx("btn", paceScope === "30" ? "btn-primary" : "btn-secondary")}>
          Last 30 runs
        </button>
        <button type="button" onClick={() => setPaceScope("full")} className={cx("btn", paceScope === "full" ? "btn-primary" : "btn-secondary")}>
          Full year
        </button>
      </div>
      {pacePoints.length ? <PaceChart points={pacePoints} /> : <EmptyState title="No pace data yet" body="Add time and mileage to any run entry and pace will start charting here." />}
      <div className="rounded-[30px] border border-[var(--line)] bg-white p-6">
        <SectionHeader eyebrow="Catch up" title="Make-it-up math" body="Choose a target date and the app will show how many extra miles per day you need to erase the current deficit." />
        <div className="mt-5 grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
          <label className="space-y-2 text-sm text-[var(--muted)]">
            <span>Target catch-up date</span>
            <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className="field" min={todayIso} />
          </label>
          <div className="rounded-[24px] bg-[var(--slate-soft)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Required extra miles per day</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-[var(--ink)]">{formatMiles(makeupPerDay)} mi</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Based on a current deficit of {formatMiles(Math.abs(Math.min(progress.surplusDeficitMiles, 0)))} miles over {daysUntilTarget} days.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SummaryPage() {
  const { ready, store, todayIso } = useTracker();
  const entries = store.runEntries.filter(
    (entry) => parseIsoDate(entry.date).getFullYear() === store.settings.year,
  );
  const summary = getYearlySummary(
    entries,
    store.settings.year,
    store.settings.challengeStartDate,
  );
  if (!ready) {
    return <EmptyState title="Loading summary" body="Preparing the year in progress snapshot." />;
  }
  return (
    <div className="space-y-8">
      <section className="rounded-[34px] bg-[linear-gradient(135deg,#173f35_0%,#357c66_52%,#f1c453_100%)] p-7 text-white">
        <p className="text-xs uppercase tracking-[0.3em] text-white/78">
          {todayIso.endsWith("12-31") ? "End-of-year summary" : "Year in progress"}
        </p>
        <h1 className="mt-3 font-display text-5xl tracking-tight">{store.settings.year} challenge snapshot</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {surface("Total miles", `${formatMiles(summary.totalMiles)} mi`, "All logged entries", "dark")}
          {surface("Challenge completion", `${Math.round(summary.completionPercent)}%`, "Day-based completion", "dark")}
          {surface("Current streak", `${summary.currentStreak}`, "Ends today or yesterday", "dark")}
          {surface("Longest streak", `${summary.longestStreak}`, "Best run this year", "dark")}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {surface(
          "Best pace day",
          summary.bestPaceEntry ? secondsToPaceString(summary.bestPaceEntry.avgPaceSeconds) : "--",
          summary.bestPaceEntry ? getShortDate(summary.bestPaceEntry.date) : "No pace data yet",
        )}
        {surface(
          "Hardest completed day",
          summary.hardestCompletedEntry ? `${formatMiles(summary.hardestCompletedEntry.requiredMiles)} mi` : "--",
          summary.hardestCompletedEntry ? getShortDate(summary.hardestCompletedEntry.date) : "No completed days yet",
        )}
        {surface(
          "Longest run",
          summary.longestRunEntry ? `${formatMiles(summary.longestRunEntry.actualMiles)} mi` : "--",
          summary.longestRunEntry ? getShortDate(summary.longestRunEntry.date) : "No entries yet",
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[30px] border border-[var(--line)] bg-white p-6">
          <SectionHeader eyebrow="Monthly breakdown" title="Month by month" body="Completion, mileage, and average pace summarize the shape of the year." />
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                <tr>
                  <th className="pb-3">Month</th>
                  <th className="pb-3">Days completed</th>
                  <th className="pb-3">Miles logged</th>
                  <th className="pb-3">Avg pace</th>
                </tr>
              </thead>
              <tbody>
                {summary.monthlyBreakdown.map((row) => (
                  <tr key={row.month} className="border-t border-[var(--line)]">
                    <td className="py-3 font-medium text-[var(--ink)]">{getMonthName(row.month)}</td>
                    <td className="py-3 text-[var(--muted)]">{row.daysCompleted}</td>
                    <td className="py-3 text-[var(--muted)]">{formatMiles(row.totalMiles)} mi</td>
                    <td className="py-3 text-[var(--muted)]">{row.avgPaceSeconds ? `${secondsToPaceString(row.avgPaceSeconds)} /mi` : "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
            <CalendarMonth key={month} year={store.settings.year} month={month} entries={entries} todayIso={todayIso} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { applyStravaSync, ready, resetStore, store, updateSettings } = useTracker();
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const previewStravaRuns = useAction(api.strava.previewRuns);
  const addEmailLogin = useMutation(api.tracker.addEmailLogin);
  const changeEmailAddress = useMutation(api.tracker.changeEmailAddress);
  const disconnectStrava = useMutation(api.tracker.disconnectStrava);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [linkingStrava, setLinkingStrava] = useState(false);
  const [credentialsEmail, setCredentialsEmail] = useState("");
  const [credentialsPassword, setCredentialsPassword] = useState("");
  const [credentialsMessage, setCredentialsMessage] = useState<string | null>(null);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [credentialsPending, setCredentialsPending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewRuns, setPreviewRuns] = useState<StravaSyncPreviewItem[]>([]);
  const [selectedPreviewRunIds, setSelectedPreviewRunIds] = useState<string[]>([]);
  const autoSyncAttempted = useRef(false);
  const stravaConnected = Boolean(store.stravaConnection);
  const usingPlaceholderEmail = Boolean(
    session?.user?.email?.endsWith("@strava.rtd.local"),
  );

  const runStravaSync = useCallback(async (selectedActivityIds?: string[]) => {
    if (!store.stravaConnection || syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const mergedCount = await applyStravaSync(selectedActivityIds);
      setSyncMessage(
        mergedCount
          ? `Imported ${mergedCount} run${mergedCount === 1 ? "" : "s"} from Strava.`
          : "Strava sync finished with no new runs to import.",
      );
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : "Unable to sync Strava right now.",
      );
    } finally {
      setSyncing(false);
    }
  }, [applyStravaSync, store.stravaConnection, syncing]);

  const openStravaPreview = useCallback(async () => {
    if (!store.stravaConnection || previewPending || syncing) return;
    setPreviewPending(true);
    setSyncMessage(null);
    try {
      const result = (await previewStravaRuns({})) as {
        importableCount: number;
        runs: StravaSyncPreviewItem[];
      };
      if (!result.importableCount) {
        setPreviewRuns([]);
        setSelectedPreviewRunIds([]);
        setPreviewOpen(false);
        setSyncMessage("Strava sync finished with no new runs to import.");
        return;
      }
      setPreviewRuns(result.runs);
      setSelectedPreviewRunIds(result.runs.map((run) => run.id));
      setPreviewOpen(true);
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : "Unable to preview Strava runs right now.",
      );
    } finally {
      setPreviewPending(false);
    }
  }, [previewPending, previewStravaRuns, store.stravaConnection, syncing]);

  useEffect(() => {
    const shouldAutoSync = searchParams.get("strava") === "linked";
    if (!shouldAutoSync || !store.stravaConnection || autoSyncAttempted.current) {
      return;
    }

    autoSyncAttempted.current = true;
    void openStravaPreview().finally(() => {
      router.replace("/settings");
    });
  }, [openStravaPreview, router, searchParams, store.stravaConnection]);

  if (!ready) {
    return <EmptyState title="Loading settings" body="Preparing the challenge defaults and storage controls." />;
  }

  return (
    <div className="space-y-8">
      <StravaSyncPreviewModal
        open={previewOpen}
        runs={previewRuns}
        selectedRunIds={selectedPreviewRunIds}
        syncing={syncing}
        onToggleRun={(runId, checked) => {
          setSelectedPreviewRunIds((current) =>
            checked ? [...current, runId] : current.filter((id) => id !== runId),
          );
        }}
        onToggleAll={() => {
          setSelectedPreviewRunIds((current) =>
            current.length === previewRuns.length ? [] : previewRuns.map((run) => run.id),
          );
        }}
        onCancel={() => {
          setPreviewOpen(false);
          setSelectedPreviewRunIds([]);
        }}
        onConfirm={() => {
          void (async () => {
            await runStravaSync(selectedPreviewRunIds);
            setPreviewOpen(false);
            setPreviewRuns([]);
            setSelectedPreviewRunIds([]);
          })();
        }}
      />
      <SectionHeader
        eyebrow="Settings"
        title="Challenge defaults"
        body="Run completed is automatic for each day, and Recovery can be marked when you log a run. The year selector switches the active challenge window for the whole app."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="rounded-[30px] border border-[var(--line)] bg-white p-6">
          <h2 className="font-display text-2xl tracking-tight text-[var(--ink)]">Checklist defaults</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Every logged day automatically gets two baseline items:
          </p>
          <div className="mt-5 space-y-3">
            <div className="rounded-[20px] bg-[var(--slate-soft)] px-4 py-3">
              <p className="font-medium text-[var(--ink)]">Run completed</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Checked automatically when the day meets its mileage requirement.
              </p>
            </div>
            <div className="rounded-[20px] bg-[var(--slate-soft)] px-4 py-3">
              <p className="font-medium text-[var(--ink)]">Recovery</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Optional when logging a run. Checked recovery shows as a red R on the calendar.
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="rounded-[30px] border border-[var(--line)] bg-white p-6">
            <h2 className="font-display text-2xl tracking-tight text-[var(--ink)]">Strava sync</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Connect Strava to import activities into this account and keep sync separate from manual entries.
            </p>
            {stravaConnected ? (
              <>
                <p className="mt-4 text-sm text-[var(--muted)]">
                  Connected athlete ID: <span className="font-semibold text-[var(--ink)]">{store.stravaConnection?.athleteId}</span>
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={openStravaPreview}
                    disabled={syncing || previewPending}
                    className="btn btn-primary"
                  >
                    {previewPending ? "Loading..." : syncing ? "Syncing..." : "Sync Runs"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={async () => {
                      setSyncMessage(null);
                      try {
                        if (!store.stravaConnection?.providerAccountId) {
                          throw new Error("Missing linked Strava account.");
                        }
                        await disconnectStrava({
                          accountId: store.stravaConnection.providerAccountId,
                        });
                        window.location.reload();
                      } catch (error) {
                        setSyncMessage(
                          error instanceof Error
                            ? error.message
                            : "Unable to disconnect Strava right now.",
                        );
                      }
                    }}
                  >
                    Disconnect Strava
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-5">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={linkingStrava}
                  onClick={async () => {
                    setLinkingStrava(true);
                    setSyncMessage(null);
                    try {
                      await authClient.oauth2.link({
                        providerId: "strava",
                        callbackURL: "/settings?strava=linked",
                      });
                    } catch (error) {
                      setSyncMessage(
                        error instanceof Error
                          ? error.message
                          : "Unable to start Strava linking.",
                      );
                      setLinkingStrava(false);
                    }
                  }}
                >
                  {linkingStrava ? "Redirecting..." : "Connect Strava"}
                </button>
              </div>
            )}
            {syncMessage ? (
              <p className="mt-4 text-sm text-[var(--muted)]">{syncMessage}</p>
            ) : null}
          </div>
          <div className="rounded-[30px] border border-[var(--line)] bg-white p-6">
            <h2 className="font-display text-2xl tracking-tight text-[var(--ink)]">Email credentials</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {usingPlaceholderEmail
                ? "This Strava-first account does not have an email login yet. Add one here."
                : "You can update your challenge data without touching your sign-in method. If you started with Strava, add email credentials here."}
            </p>
            <form
              className="mt-5 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setCredentialsPending(true);
                setCredentialsError(null);
                setCredentialsMessage(null);
                try {
                  if (usingPlaceholderEmail) {
                    await addEmailLogin({
                      email: credentialsEmail,
                      password: credentialsPassword,
                    });
                    setCredentialsMessage(
                      "Email login added. Confirm the email address from the verification email to finish linking it.",
                    );
                  } else {
                    await changeEmailAddress({
                      email: credentialsEmail,
                    });
                    setCredentialsMessage(
                      "Check your new email address to confirm the change.",
                    );
                  }
                } catch (error) {
                  setCredentialsError(
                    error instanceof Error
                      ? error.message
                      : "Unable to update email credentials right now.",
                  );
                } finally {
                  setCredentialsPending(false);
                }
              }}
            >
              <label className="block space-y-2 text-sm text-[var(--muted)]">
                <span>Email</span>
                <input
                  type="email"
                  value={credentialsEmail}
                  onChange={(event) => setCredentialsEmail(event.target.value)}
                  placeholder={usingPlaceholderEmail ? "name@email.com" : session?.user?.email ?? "name@email.com"}
                  className="field"
                  required
                />
              </label>
              {usingPlaceholderEmail ? (
                <label className="block space-y-2 text-sm text-[var(--muted)]">
                  <span>Password</span>
                  <input
                    type="password"
                    value={credentialsPassword}
                    onChange={(event) => setCredentialsPassword(event.target.value)}
                    minLength={8}
                    className="field"
                    required
                  />
                </label>
              ) : null}
              <button type="submit" className="btn btn-secondary" disabled={credentialsPending}>
                {credentialsPending ? "Saving..." : usingPlaceholderEmail ? "Add email login" : "Change email"}
              </button>
            </form>
            {credentialsMessage ? (
              <p className="mt-4 text-sm text-[var(--muted)]">{credentialsMessage}</p>
            ) : null}
            {credentialsError ? (
              <p className="mt-4 text-sm text-[var(--danger)]">{credentialsError}</p>
            ) : null}
            {credentialsMessage && credentialsEmail ? (
              <div className="mt-4">
                <DevEmailNoticeInline email={credentialsEmail} />
              </div>
            ) : null}
          </div>
          <div className="rounded-[30px] border border-[var(--line)] bg-white p-6">
            <h2 className="font-display text-2xl tracking-tight text-[var(--ink)]">Challenge year</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Switching years filters the current entries to that year for this account.</p>
            <label className="mt-5 block space-y-2 text-sm text-[var(--muted)]">
              <span>Year</span>
              <input type="number" value={store.settings.year} onChange={(event) => updateSettings({ year: Number(event.target.value) })} className="field" />
            </label>
            <label className="mt-4 block space-y-2 text-sm text-[var(--muted)]">
              <span>Challenge start date</span>
              <input type="date" value={store.settings.challengeStartDate} onChange={(event) => updateSettings({ challengeStartDate: event.target.value })} className="field" />
            </label>
          </div>
          <div className="rounded-[30px] border border-[var(--line)] bg-white p-6">
            <h2 className="font-display text-2xl tracking-tight text-[var(--ink)]">Storage controls</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Clear all saved runs for this account and return the tracker to a clean first-use state.</p>
            <button type="button" onClick={resetStore} className="btn btn-secondary mt-5">
              Clear all data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function DevEmailNoticeInline({ email }: { email: string }) {
  return (
    <p className="text-sm text-[var(--muted)]">
      If no email provider is configured yet, watch the development inbox for {email}.
    </p>
  );
}

export function DayPage({ date }: { date: string }) {
  const { deleteRunEntry, deleteRunSegment, ready, store, todayIso } = useTracker();
  const entry = store.runEntries.find((item) => item.date === date);
  const future = compareIsoDates(date, todayIso) > 0;
  const tone = getStatusTone(date, entry, todayIso);
  const [addingRun, setAddingRun] = useState(false);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  if (!ready) {
    return <EmptyState title="Loading day details" body="Preparing the run entry, checklist, media, and stats for this date." />;
  }
  return (
    <div className="space-y-8">
      <section className="rounded-[34px] border border-[var(--line)] bg-white p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Day {getDayOfYear(date)}</p>
            <h1 className="mt-3 font-display text-4xl tracking-tight text-[var(--ink)]">{getLongDate(date)}</h1>
            <p className="mt-3 text-base text-[var(--muted)]">
              Required mileage: <span className="font-semibold text-[var(--ink)]">{formatMiles(getRequiredMiles(date))} miles</span>
            </p>
            {entry ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                {entry.runs.length} run{entry.runs.length === 1 ? "" : "s"} assigned to this day
              </p>
            ) : null}
          </div>
          <StatusPill
            tone={tone}
            label={
              future
                ? "Future day"
                : entry?.completed
                  ? "Completed"
                  : entry
                    ? "Partial"
                    : "Missed"
            }
          />
        </div>
      </section>

      {entry?.media.find((item) => item.type === "map") ? (
        <Image
          src={entry.media.find((item) => item.type === "map")?.url ?? ""}
          alt="Route map"
          width={1400}
          height={720}
          unoptimized
          className="h-80 w-full rounded-[34px] object-cover"
        />
      ) : null}

      {entry ? (
        <>
          <MetricGrid entry={entry} />

          <div className="rounded-[30px] border border-[var(--line)] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl tracking-tight text-[var(--ink)]">Runs for this day</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Multiple runs on the same day are totaled automatically. You can also reassign any run to a different day.
                </p>
              </div>
              <button type="button" onClick={() => {
                setAddingRun((current) => !current);
                setEditingRunId(null);
              }} className="btn btn-secondary">
                {addingRun ? "Close new run form" : "Add another run"}
              </button>
            </div>

            {addingRun ? (
              <div className="mt-5">
                <LogForm
                  date={date}
                  entry={entry}
                  onSaved={() => setAddingRun(false)}
                  submitLabel="Add run"
                />
              </div>
            ) : null}

            <div className="mt-5 space-y-4">
              {entry.runs.map((run, index) => (
                <div key={run.id} className="rounded-[24px] bg-[var(--slate-soft)] p-5">
                  {editingRunId === run.id ? (
                    <LogForm
                      date={date}
                      entry={entry}
                      run={run}
                      onSaved={() => setEditingRunId(null)}
                      submitLabel="Save run"
                    />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                            Run {index + 1} · {run.source === "strava" ? "Strava" : "Manual"}
                          </p>
                          <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)]">
                            {formatMiles(run.actualMiles)} mi
                          </p>
                          <p className="mt-2 text-sm text-[var(--muted)]">
                            Counted toward {getShortDate(run.assignedDate)}
                            {run.startedAt ? ` · Started ${new Date(run.startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => {
                            setEditingRunId(run.id);
                            setAddingRun(false);
                          }} className="btn btn-secondary">
                            Edit
                          </button>
                          <button type="button" onClick={() => deleteRunSegment(run.id)} className="btn btn-danger">
                            Delete run
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Time</p>
                          <p className="mt-1 font-semibold text-[var(--ink)]">{secondsToTimeString(run.totalTimeSeconds)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Pace</p>
                          <p className="mt-1 font-semibold text-[var(--ink)]">{secondsToPaceString(run.avgPaceSeconds)} /mi</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Elevation</p>
                          <p className="mt-1 font-semibold text-[var(--ink)]">{run.elevationGain ? `${run.elevationGain} ft` : "--"}</p>
                        </div>
                      </div>
                      {run.notes ? (
                        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{run.notes}</p>
                      ) : null}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {entry.runs.length === 1 && entry.splits.length ? (
            <div className="rounded-[30px] border border-[var(--line)] bg-white p-6">
              <h2 className="font-display text-2xl tracking-tight text-[var(--ink)]">Splits</h2>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[340px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                    <tr>
                      <th className="pb-3">Mile</th>
                      <th className="pb-3">Pace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.splits.map((split) => (
                      <tr key={split.id} className="border-t border-[var(--line)]">
                        <td className="py-3 text-[var(--ink)]">{split.mileNumber}</td>
                        <td className="py-3 text-[var(--muted)]">{secondsToPaceString(split.paceSeconds)} /mi</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <ChecklistEditor date={date} entry={entry} />
          <MediaManager date={date} entry={entry} />

          <div className="rounded-[30px] border border-[var(--line)] bg-white p-6">
            <h2 className="font-display text-2xl tracking-tight text-[var(--ink)]">Notes</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">
              {flattenEntryNotes(entry) || "No notes saved for this day."}
            </p>
          </div>

          <button type="button" onClick={() => deleteRunEntry(date)} className="btn btn-danger">
            Delete day
          </button>
        </>
      ) : future ? (
        <EmptyState title="Future day" body={`Required: ${formatMiles(getRequiredMiles(date))} miles. Logging stays disabled until the date arrives.`} />
      ) : (
        <div className="space-y-6">
          <EmptyState title="No run entry yet" body="Log the run here to create the day record. Past dates count as missed until you backfill them." />
          <LogForm date={date} submitLabel="Save run" />
        </div>
      )}
    </div>
  );
}
