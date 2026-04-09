import { v } from "convex/values";
import type { GenericActionCtx } from "convex/server";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { fetchStravaActivities, mapStravaActivityToRun } from "../lib/strava";
import type { DataModel } from "./_generated/dataModel";

async function getImportableStravaRuns(
  ctx: GenericActionCtx<DataModel>,
  selectedActivityIds?: string[],
) {
  await ctx.runMutation(api.tracker.ensureProfile, {});
  const trackerState = await ctx.runQuery(api.tracker.getTrackerState, {});
  const existingActivityIds = new Set(
    trackerState.store.runEntries.flatMap((entry) =>
      entry.runs.map((run) => run.stravaActivityId).filter(Boolean),
    ),
  );

  const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
  const accounts = await auth.api.listUserAccounts({ headers });
  const strava = accounts.find((account) => account.providerId === "strava");

  if (!strava) {
    throw new Error("Strava is not linked to this account.");
  }

  const token = await auth.api.getAccessToken({
    headers,
    body: {
      providerId: "strava",
      accountId: strava.accountId,
    },
  });

  if (!token?.accessToken) {
    throw new Error("Strava access token is unavailable.");
  }

  const activities = await fetchStravaActivities({
    accessToken: token.accessToken,
  });

  const selectedActivityIdSet = selectedActivityIds?.length
    ? new Set(selectedActivityIds)
    : null;

  const runs = activities
    .filter(
      (activity) =>
        activity.type === "Run" &&
        !existingActivityIds.has(String(activity.id)) &&
        (!selectedActivityIdSet || selectedActivityIdSet.has(String(activity.id))),
    )
    .map((activity) =>
      mapStravaActivityToRun(activity, activity.start_date_local.slice(0, 10)),
    );

  const preview = activities
    .filter(
      (activity) =>
        activity.type === "Run" &&
        !existingActivityIds.has(String(activity.id)) &&
        (!selectedActivityIdSet || selectedActivityIdSet.has(String(activity.id))),
    )
    .map((activity) => ({
      id: String(activity.id),
      name: activity.name,
      date: activity.start_date_local.slice(0, 10),
      actualMiles: Number((activity.distance / 1609.344).toFixed(2)),
    }));

  return { runs, preview };
}

export const previewRuns: ReturnType<typeof action> = action({
  args: {},
  handler: async (ctx) => {
    const result = await getImportableStravaRuns(ctx);
    return {
      importableCount: result.preview.length,
      runs: result.preview,
    };
  },
});

export const syncRuns: ReturnType<typeof action> = action({
  args: {
    selectedActivityIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const result = await getImportableStravaRuns(ctx, args.selectedActivityIds);
    const imported = await ctx.runMutation(api.tracker.importStravaRuns, {
      runs: result.runs,
    });

    return {
      importedCount: imported.importedCount,
    };
  },
});
