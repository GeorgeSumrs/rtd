"use client";

import { useAction } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "@/convex/_generated/api";
import { formatMiles } from "@/lib/challenge";
import { useTracker } from "@/components/tracker-provider";

type StravaSyncPreviewItem = {
  id: string;
  name: string;
  date: string;
  actualMiles: number;
};

export function StravaSyncPreviewModal({
  open,
  runs,
  selectedRunIds,
  syncing,
  onToggleRun,
  onToggleAll,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  runs: StravaSyncPreviewItem[];
  selectedRunIds: string[];
  syncing: boolean;
  onToggleRun: (runId: string, checked: boolean) => void;
  onToggleAll: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const allSelected = runs.length > 0 && selectedRunIds.length === runs.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-[30px] border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
        <div className="border-b border-[var(--line)] px-6 py-5">
          <h2 className="font-display text-3xl tracking-tight text-[var(--ink)]">Review Strava import</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {selectedRunIds.length} of {runs.length} run{runs.length === 1 ? "" : "s"} selected.
          </p>
        </div>
        <div className="max-h-[48vh] overflow-y-auto px-6 py-4">
          <div className="space-y-3">
            {runs.map((run) => (
              <label key={run.id} className="flex cursor-pointer items-start gap-3 rounded-[20px] bg-[var(--slate-soft)] px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedRunIds.includes(run.id)}
                  onChange={(event) => onToggleRun(run.id, event.target.checked)}
                  className="mt-1"
                />
                <div>
                  <p className="font-semibold text-[var(--ink)]">{run.name}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {formatMiles(run.actualMiles)} mi
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--line)] px-6 py-5">
          <button type="button" className="btn btn-secondary" onClick={onToggleAll} disabled={syncing}>
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={syncing}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={syncing || selectedRunIds.length === 0} onClick={onConfirm}>
            {syncing ? "Syncing..." : "Add runs"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StravaLogUploadCard() {
  const { applyStravaSync, ready, store } = useTracker();
  const previewStravaRuns = useAction(api.strava.previewRuns);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [previewRuns, setPreviewRuns] = useState<StravaSyncPreviewItem[]>([]);
  const [selectedPreviewRunIds, setSelectedPreviewRunIds] = useState<string[]>([]);

  const stravaConnected = Boolean(store.stravaConnection);

  const openStravaPreview = useCallback(async () => {
    if (!stravaConnected || previewPending || syncing) return;
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
        setSyncMessage("Strava sync found no new runs to add.");
        return;
      }
      setPreviewRuns(result.runs);
      setSelectedPreviewRunIds([]);
      setPreviewOpen(true);
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : "Unable to preview Strava runs right now.",
      );
    } finally {
      setPreviewPending(false);
    }
  }, [previewPending, previewStravaRuns, stravaConnected, syncing]);

  const runStravaSync = useCallback(async () => {
    if (!stravaConnected || syncing || selectedPreviewRunIds.length === 0) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const importedCount = await applyStravaSync(selectedPreviewRunIds);
      setSyncMessage(
        importedCount
          ? `Imported ${importedCount} run${importedCount === 1 ? "" : "s"} from Strava.`
          : "No runs were imported.",
      );
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : "Unable to sync Strava right now.",
      );
    } finally {
      setSyncing(false);
    }
  }, [applyStravaSync, selectedPreviewRunIds, stravaConnected, syncing]);

  if (!ready || !stravaConnected) {
    return null;
  }

  return (
    <>
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
            await runStravaSync();
            setPreviewOpen(false);
            setPreviewRuns([]);
            setSelectedPreviewRunIds([]);
          })();
        }}
      />

      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[30px] border border-[var(--line)] bg-white p-6 text-center shadow-[0_18px_45px_rgba(32,44,37,0.08)]">
        <h2 className="font-display text-3xl tracking-tight text-[var(--ink)]">
          Upload from Strava
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Preview importable Strava runs and choose exactly which ones to add.
        </p>
        <button
          type="button"
          onClick={openStravaPreview}
          disabled={previewPending || syncing}
          className="btn btn-primary mt-5"
        >
          {previewPending ? "Loading..." : syncing ? "Syncing..." : "Open Strava runs"}
        </button>
        {syncMessage ? <p className="mt-4 text-sm text-[var(--muted)]">{syncMessage}</p> : null}
      </div>
    </>
  );
}
