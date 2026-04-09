import type { ChecklistItem, RunEntry, RunSegment } from "@/lib/types";

const DEFAULT_CHECKLIST = [
  "Run completed",
  "Stretching",
  "Hydration",
  "Recovery",
] as const;

export function pad(value: number) {
  return value.toString().padStart(2, "0");
}

export function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseIsoDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date();
  }
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isLeapYear(year: number) {
  return new Date(year, 1, 29).getDate() === 29;
}

export function getRequiredMiles(input: Date | string) {
  const date = typeof input === "string" ? parseIsoDate(input) : input;
  return Number(
    `${date.getMonth() + 1}.${date.getDate().toString().padStart(2, "0")}`,
  );
}

export function getDayOfYear(input: Date | string) {
  const date = typeof input === "string" ? parseIsoDate(input) : input;
  const utcDate = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const utcStart = Date.UTC(date.getFullYear(), 0, 0);
  return Math.floor((utcDate - utcStart) / 86_400_000);
}

export function formatMiles(value: number) {
  return value.toFixed(2);
}

export function calculatePace(distanceMiles: number, totalSeconds: number) {
  return distanceMiles > 0 ? Math.round(totalSeconds / distanceMiles) : 0;
}

export function sumNumbers(values: Array<number | undefined>) {
  let total = 0;
  for (const value of values) {
    total += value ?? 0;
  }
  return total > 0 ? total : undefined;
}

export function secondsToPaceString(seconds?: number) {
  if (!seconds && seconds !== 0) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function secondsToTimeString(seconds?: number) {
  if (!seconds && seconds !== 0) return "--";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function timeStringToSeconds(value: string) {
  const parts = value.split(":").map((part) => Number(part.trim()));
  if (parts.some(Number.isNaN)) return undefined;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return undefined;
}

export function paceStringToSeconds(value: string) {
  const parts = value.split(":").map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some(Number.isNaN)) return undefined;
  return parts[0] * 60 + parts[1];
}

export function compareIsoDates(a: string, b: string) {
  return a.localeCompare(b);
}

export function isFutureDate(value: string, today = new Date()) {
  return compareIsoDates(value, toIsoDate(today)) > 0;
}

export function buildChecklistItems(
  labels: readonly string[] = DEFAULT_CHECKLIST,
  completed = false,
) {
  return labels.map((label, index) => ({
    id: `${label.toLowerCase().replace(/\s+/g, "-")}-${index}-${Date.now()}`,
    label,
    completed: label === "Run completed" ? completed : false,
    order: index,
  }));
}

export function ensureChecklist(items: ChecklistItem[], entryCompleted: boolean) {
  return items.map((item) =>
    item.label === "Run completed"
      ? {
          ...item,
          completed: entryCompleted,
        }
      : item,
  );
}

export function createRunSegment(
  input: Omit<RunSegment, "id" | "createdAt" | "updatedAt"> &
    Partial<Pick<RunSegment, "id" | "createdAt" | "updatedAt">>,
) {
  return {
    ...input,
    id: input.id ?? `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: input.createdAt ?? Date.now(),
    updatedAt: input.updatedAt ?? Date.now(),
  } satisfies RunSegment;
}

export function flattenEntryNotes(entry: RunEntry) {
  if (!entry.runs.length) return entry.notes;
  if (entry.runs.length === 1) {
    return entry.runs[0]?.notes ?? entry.notes;
  }
  const notes = entry.runs
    .map((run, index) =>
      run.notes?.trim()
        ? `Run ${index + 1}${run.source === "strava" ? " (Strava)" : ""}: ${run.notes.trim()}`
        : "",
    )
    .filter(Boolean);
  return notes.length ? notes.join("\n\n") : entry.notes;
}

export function aggregateRuns(
  date: string,
  runs: RunSegment[],
  completedOverride?: boolean,
) {
  const sortedRuns = [...runs].sort((a, b) => a.createdAt - b.createdAt);
  const actualMiles = Number(
    sortedRuns.reduce((sum, run) => sum + run.actualMiles, 0).toFixed(2),
  );
  const totalTimeSeconds = sumNumbers(sortedRuns.map((run) => run.totalTimeSeconds));
  const elevationGain = sumNumbers(sortedRuns.map((run) => run.elevationGain));
  const avgPaceSeconds =
    totalTimeSeconds && actualMiles > 0
      ? calculatePace(actualMiles, totalTimeSeconds)
      : undefined;
  const splits = sortedRuns.flatMap((run) => run.splits);
  const requiredMiles = getRequiredMiles(date);
  const completed =
    typeof completedOverride === "boolean"
      ? completedOverride
      : actualMiles >= requiredMiles;

  return {
    requiredMiles,
    actualMiles,
    totalTimeSeconds,
    avgPaceSeconds,
    elevationGain,
    splits,
    completed,
    runs: sortedRuns,
  };
}

export function buildRunEntryFromRuns({
  date,
  runs,
  checklistItems,
  media,
  completedOverride,
  notes,
  createdAt,
}: {
  date: string;
  runs: RunSegment[];
  checklistItems: ChecklistItem[];
  media: RunEntry["media"];
  completedOverride?: boolean;
  notes?: string;
  createdAt?: number;
}) {
  const aggregate = aggregateRuns(date, runs, completedOverride);
  return {
    id: `entry-${date}`,
    date,
    ...aggregate,
    notes,
    completedOverride,
    checklistItems: ensureChecklist(checklistItems, aggregate.completed),
    media,
    createdAt: createdAt ?? runs[0]?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  } satisfies RunEntry;
}

export function startOfWeek(today = new Date()) {
  const date = new Date(today);
  const diff = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function datesForYear(year: number) {
  const results: string[] = [];
  const cursor = new Date(year, 0, 1);
  while (cursor.getFullYear() === year) {
    results.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
}

export function getMonthName(month: number) {
  return new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(2025, month - 1, 1),
  );
}

export function getShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parseIsoDate(value));
}

export function getLongDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parseIsoDate(value));
}

export function getStatusTone(
  date: string,
  entry: RunEntry | undefined,
  todayIso: string,
) {
  if (compareIsoDates(date, todayIso) > 0) return "future";
  if (entry?.completed) return "complete";
  if (entry) return "partial";
  return "missed";
}

export function getMonthMatrix(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const firstGridDate = new Date(year, month - 1, 1 - startOffset);
  const weeks: string[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const row: string[] = [];
    for (let day = 0; day < 7; day += 1) {
      const current = new Date(firstGridDate);
      current.setDate(firstGridDate.getDate() + week * 7 + day);
      row.push(toIsoDate(current));
    }
    weeks.push(row);
  }
  return weeks;
}

export function getProgressSummary(
  entries: RunEntry[],
  year: number,
  challengeStartDate: string,
  today = new Date(),
) {
  const todayIso = toIsoDate(today);
  const yearDates = datesForYear(year);
  const todayOrYearEnd =
    today.getFullYear() === year ? todayIso : `${year}-12-31`;
  const inScope = yearDates.filter(
    (date) =>
      compareIsoDates(date, challengeStartDate) >= 0 &&
      compareIsoDates(date, todayOrYearEnd) <= 0,
  );
  const pastInScope = inScope.filter((date) => compareIsoDates(date, todayIso) < 0);
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const completedDays = inScope.filter((date) => byDate.get(date)?.completed).length;
  const creditedMiles = inScope.reduce((sum, date) => {
    const entry = byDate.get(date);
    return entry?.completed ? sum + getRequiredMiles(date) : sum;
  }, 0);
  const missedDates = pastInScope.filter((date) => !byDate.get(date)?.completed);
  const totalLogged = entries.reduce((sum, entry) => sum + entry.actualMiles, 0);
  const totalRequired = inScope.reduce((sum, date) => sum + getRequiredMiles(date), 0);
  const catchUpRequired = pastInScope.reduce((sum, date) => sum + getRequiredMiles(date), 0);
  const catchUpLogged = entries
    .filter((entry) => compareIsoDates(entry.date, todayIso) < 0)
    .reduce((sum, entry) => sum + entry.actualMiles, 0);
  const totalRequiredFullYear = yearDates.reduce(
    (sum, date) => sum + getRequiredMiles(date),
    0,
  );
  let currentStreak = 0;
  const streakEnd =
    byDate.get(todayIso)?.completed || compareIsoDates(todayIso, `${year}-12-31`) > 0
      ? todayIso
      : toIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  for (let index = inScope.length - 1; index >= 0; index -= 1) {
    const date = inScope[index];
    if (compareIsoDates(date, streakEnd) > 0) continue;
    if (byDate.get(date)?.completed) {
      currentStreak += 1;
    } else {
      break;
    }
  }
  let longestStreak = 0;
  let streak = 0;
  for (const date of inScope) {
    if (byDate.get(date)?.completed) {
      streak += 1;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      streak = 0;
    }
  }
  return {
    completedDays,
    missedDays: missedDates.length,
    totalDaysSoFar: inScope.length,
    totalDaysInYear: yearDates.length,
    totalLogged,
    creditedMiles,
    totalRequired,
    totalRequiredFullYear,
    surplusDeficitMiles: catchUpLogged - catchUpRequired,
    catchUpDeficitMiles: Math.max(catchUpRequired - catchUpLogged, 0),
    currentStreak,
    longestStreak,
    missedDates: missedDates.reverse(),
  };
}

export function getWeeklySummary(entries: RunEntry[], today = new Date()) {
  const start = startOfWeek(today);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const weekDates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    weekDates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const weekEntries = weekDates.map((date) => byDate.get(date)).filter(Boolean) as RunEntry[];
  const creditedMiles = weekDates.reduce((sum, date) => {
    const entry = byDate.get(date);
    return entry?.completed ? sum + getRequiredMiles(date) : sum;
  }, 0);
  const requiredMiles = weekDates.reduce((sum, date) => sum + getRequiredMiles(date), 0);
  const paceEntries = weekEntries.filter((entry) => entry.avgPaceSeconds);
  return {
    weekStart: toIsoDate(start),
    weekEnd: toIsoDate(end),
    daysRun: weekEntries.filter((entry) => entry.completed).length,
    totalMiles: weekEntries.reduce((sum, entry) => sum + entry.actualMiles, 0),
    creditedMiles,
    requiredMiles,
    avgPaceSeconds: paceEntries.length
      ? Math.round(
          paceEntries.reduce((sum, entry) => sum + (entry.avgPaceSeconds ?? 0), 0) /
            paceEntries.length,
        )
      : undefined,
    completionRate:
      (weekEntries.filter((entry) => entry.completed).length / 7) * 100,
  };
}

export function getChartData(entries: RunEntry[], year: number) {
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const dates = datesForYear(year);
  let cumulativeActualMiles = 0;
  let cumulativeRequiredMiles = 0;
  const cumulativeActual = dates.map((date) => {
    cumulativeActualMiles += byDate.get(date)?.actualMiles ?? 0;
    return {
      date,
      dayOfYear: getDayOfYear(date),
      miles: Number(cumulativeActualMiles.toFixed(2)),
    };
  });
  const cumulativeRequired = dates.map((date) => {
    cumulativeRequiredMiles += getRequiredMiles(date);
    return {
      date,
      dayOfYear: getDayOfYear(date),
      miles: Number(cumulativeRequiredMiles.toFixed(2)),
    };
  });
  const paceTrend = entries
    .filter((entry) => entry.avgPaceSeconds)
    .sort((a, b) => compareIsoDates(a.date, b.date))
    .map((entry) => ({
      date: entry.date,
      paceSeconds: entry.avgPaceSeconds ?? 0,
      miles: entry.actualMiles,
    }));
  return { cumulativeActual, cumulativeRequired, paceTrend };
}

export function getMonthlyBreakdown(entries: RunEntry[], year: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const monthEntries = entries.filter((entry) => {
      const date = parseIsoDate(entry.date);
      return date.getFullYear() === year && date.getMonth() + 1 === month;
    });
    const withPace = monthEntries.filter((entry) => entry.avgPaceSeconds);
    return {
      month,
      daysCompleted: monthEntries.filter((entry) => entry.completed).length,
      totalMiles: monthEntries.reduce((sum, entry) => sum + entry.actualMiles, 0),
      avgPaceSeconds: withPace.length
        ? Math.round(
            withPace.reduce((sum, entry) => sum + (entry.avgPaceSeconds ?? 0), 0) /
              withPace.length,
          )
        : undefined,
    };
  });
}

export function getYearlySummary(
  entries: RunEntry[],
  year: number,
  challengeStartDate: string,
  today = new Date(),
) {
  const progress = getProgressSummary(entries, year, challengeStartDate, today);
  const withPace = entries.filter((entry) => entry.avgPaceSeconds);
  const bestPaceEntry = withPace.sort(
    (a, b) => (a.avgPaceSeconds ?? 0) - (b.avgPaceSeconds ?? 0),
  )[0];
  const hardestCompletedEntry = [...entries]
    .filter((entry) => entry.completed)
    .sort((a, b) => b.requiredMiles - a.requiredMiles)[0];
  const longestRunEntry = [...entries].sort((a, b) => b.actualMiles - a.actualMiles)[0];
  return {
    totalMiles: progress.totalLogged,
    completionPercent:
      progress.totalDaysSoFar > 0
        ? (progress.completedDays / progress.totalDaysSoFar) * 100
        : 0,
    bestPaceEntry,
    hardestCompletedEntry,
    longestRunEntry,
    totalElevationGain: entries.reduce(
      (sum, entry) => sum + (entry.elevationGain ?? 0),
      0,
    ),
    currentStreak: progress.currentStreak,
    longestStreak: progress.longestStreak,
    monthlyBreakdown: getMonthlyBreakdown(entries, year),
  };
}

export function defaultSettings(today = new Date()) {
  const year = today.getFullYear();
  return {
    defaultChecklistItems: [...DEFAULT_CHECKLIST],
    year,
    challengeStartDate: `${year}-01-01`,
  };
}
