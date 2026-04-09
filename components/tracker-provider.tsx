"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useTransition,
} from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { createEmptyStore } from "@/lib/default-store";
import { parseIsoDate, toIsoDate } from "@/lib/challenge";
import type {
  ChecklistItem,
  MediaItem,
  RunSegment,
  TrackerStore,
  UserSettings,
} from "@/lib/types";

type UpsertRunEntryInput = {
  runId?: string;
  date: string;
  actualMiles: number;
  totalTimeSeconds?: number;
  avgPaceSeconds?: number;
  elevationGain?: number;
  notes?: string;
  completedOverride?: boolean;
  splits?: RunSegment["splits"];
  startedAt?: string;
  source?: RunSegment["source"];
  stravaActivityId?: string;
  recoveryCompleted?: boolean;
};

type TrackerContextValue = {
  store: TrackerStore;
  todayIso: string;
  ready: boolean;
  signedIn: boolean;
  upsertRunEntry: (input: UpsertRunEntryInput) => void;
  deleteRunSegment: (runId: string) => void;
  deleteRunEntry: (date: string) => void;
  replaceChecklist: (date: string, items: ChecklistItem[]) => void;
  toggleChecklistItem: (date: string, itemId: string, completed: boolean) => void;
  saveMedia: (date: string, item: MediaItem) => void;
  deleteMedia: (date: string, mediaId: string) => void;
  updateSettings: (patch: Partial<UserSettings>) => void;
  applyStravaSync: (selectedActivityIds?: string[]) => Promise<number>;
  markMilestoneSeen: (milestone: number) => void;
  resetStore: () => void;
};

const TrackerContext = createContext<TrackerContextValue | null>(null);

export function TrackerProvider({
  children,
  initialTodayIso,
}: {
  children: React.ReactNode;
  initialTodayIso?: string;
}) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const trackerState = useQuery(
    api.tracker.getTrackerState,
    session?.user ? {} : "skip",
  );
  const ensureProfile = useMutation(api.tracker.ensureProfile);
  const upsertRunEntryMutation = useMutation(api.tracker.upsertRunEntry);
  const deleteRunSegmentMutation = useMutation(api.tracker.deleteRunSegment);
  const deleteRunEntryMutation = useMutation(api.tracker.deleteRunEntry);
  const replaceChecklistMutation = useMutation(api.tracker.replaceChecklist);
  const toggleChecklistMutation = useMutation(api.tracker.toggleChecklistItem);
  const saveMediaMutation = useMutation(api.tracker.saveMedia);
  const deleteMediaMutation = useMutation(api.tracker.deleteMedia);
  const updateSettingsMutation = useMutation(api.tracker.updateSettings);
  const markMilestoneSeenMutation = useMutation(api.tracker.markMilestoneSeen);
  const clearAllDataMutation = useMutation(api.tracker.clearAllData);
  const syncStravaAction = useAction(api.strava.syncRuns);
  const [, startSyncTransition] = useTransition();

  useEffect(() => {
    if (!session?.user) {
      return;
    }
    void ensureProfile({});
  }, [ensureProfile, session?.user]);

  const fallbackDate = parseIsoDate(initialTodayIso);
  const todayIso = initialTodayIso ?? toIsoDate(fallbackDate);
  const store = useMemo(
    () => trackerState?.store ?? createEmptyStore(fallbackDate),
    [fallbackDate, trackerState],
  );
  const ready = !sessionPending && (!session?.user || trackerState !== undefined);

  const value = useMemo<TrackerContextValue>(
    () => ({
      store,
      todayIso,
      ready,
      signedIn: Boolean(session?.user),
      upsertRunEntry: (input) => {
        void upsertRunEntryMutation({
          runId: input.runId,
          date: input.date,
          actualMiles: input.actualMiles,
          totalTimeSeconds: input.totalTimeSeconds,
          avgPaceSeconds: input.avgPaceSeconds,
          elevationGain: input.elevationGain,
          notes: input.notes,
          completedOverride: input.completedOverride,
          splits: input.splits ?? [],
          startedAt: input.startedAt,
          source: input.source,
          stravaActivityId: input.stravaActivityId,
          recoveryCompleted: input.recoveryCompleted,
        });
      },
      deleteRunSegment: (runId) => {
        void deleteRunSegmentMutation({ runId });
      },
      deleteRunEntry: (date) => {
        void deleteRunEntryMutation({ date });
      },
      replaceChecklist: (date, items) => {
        void replaceChecklistMutation({ date, items });
      },
      toggleChecklistItem: (date, itemId, completed) => {
        void toggleChecklistMutation({ date, itemId, completed });
      },
      saveMedia: (date, item) => {
        void saveMediaMutation({ date, item });
      },
      deleteMedia: (date, mediaId) => {
        void deleteMediaMutation({ date, mediaId });
      },
      updateSettings: (patch) => {
        void updateSettingsMutation({
          defaultChecklistItems: patch.defaultChecklistItems,
          year: patch.year,
          challengeStartDate: patch.challengeStartDate,
        });
      },
      applyStravaSync: (selectedActivityIds) =>
        new Promise<number>((resolve, reject) => {
          startSyncTransition(() => {
            void syncStravaAction({
              selectedActivityIds,
            })
              .then((result) => resolve(result.importedCount))
              .catch(reject);
          });
        }),
      markMilestoneSeen: (milestone) => {
        void markMilestoneSeenMutation({ milestone });
      },
      resetStore: () => {
        void clearAllDataMutation({});
      },
    }),
    [
      clearAllDataMutation,
      deleteMediaMutation,
      deleteRunEntryMutation,
      deleteRunSegmentMutation,
      markMilestoneSeenMutation,
      ready,
      replaceChecklistMutation,
      saveMediaMutation,
      session?.user,
      startSyncTransition,
      store,
      syncStravaAction,
      todayIso,
      toggleChecklistMutation,
      updateSettingsMutation,
      upsertRunEntryMutation,
    ],
  );

  return (
    <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>
  );
}

export function useTracker() {
  const context = useContext(TrackerContext);
  if (!context) {
    throw new Error("useTracker must be used within TrackerProvider");
  }
  return context;
}
