import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "./_generated/dataModel";
import {
  aggregateRuns,
  buildChecklistItems,
  buildRunEntryFromRuns,
  createRunSegment,
  defaultSettings,
  ensureChecklist,
} from "../lib/challenge";

const splitArg = v.object({
  id: v.string(),
  mileNumber: v.number(),
  paceSeconds: v.number(),
});

const mediaArg = v.object({
  id: v.string(),
  type: v.union(v.literal("photo"), v.literal("map")),
  url: v.string(),
  name: v.string(),
  order: v.number(),
  createdAt: v.number(),
});

const runArg = v.object({
  id: v.string(),
  assignedDate: v.string(),
  actualMiles: v.number(),
  totalTimeSeconds: v.optional(v.number()),
  avgPaceSeconds: v.optional(v.number()),
  elevationGain: v.optional(v.number()),
  notes: v.optional(v.string()),
  splits: v.array(splitArg),
  stravaActivityId: v.optional(v.string()),
  source: v.optional(v.union(v.literal("manual"), v.literal("strava"))),
  startedAt: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function requireViewer(ctx: GenericCtx<DataModel>) {
  const user = await authComponent.getAuthUser(ctx);
  const profile = "db" in ctx
    ? await ctx.db
        .query("profiles")
        .withIndex("by_auth_user_id", (q) => q.eq("authUserId", user._id))
        .unique()
    : null;
  return { user, profile };
}

async function requireViewerWithDb(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
) {
  const { user, profile } = await requireViewer(ctx as unknown as GenericCtx<DataModel>);
  return { user, profile };
}

function normalizeChecklist(defaultChecklistItems: string[], items: Array<{ id: string; label: string; completed: boolean; order: number }>, completed: boolean) {
  if (items.length) {
    return ensureChecklist(items, completed);
  }
  return buildChecklistItems(defaultChecklistItems, completed);
}

async function ensureProfileDoc(ctx: GenericMutationCtx<DataModel>) {
  const { user, profile } = await requireViewerWithDb(ctx);
  if (profile) {
    return { user, profile };
  }

  const settings = defaultSettings();
  const now = Date.now();
  const profileId = await ctx.db.insert("profiles", {
    authUserId: user._id,
    email: user.email,
    name: user.name,
    image: user.image ?? undefined,
    defaultChecklistItems: settings.defaultChecklistItems,
    year: settings.year,
    challengeStartDate: settings.challengeStartDate,
    lastShownMilestone: 0,
    createdAt: now,
    updatedAt: now,
  });

  const nextProfile = await ctx.db.get(profileId);
  if (!nextProfile) {
    throw new Error("Unable to create profile.");
  }

  return { user, profile: nextProfile };
}

function formatAccounts(accounts: Array<{ providerId: string; accountId: string; scopes?: string[] }>) {
  const strava = accounts.find((account) => account.providerId === "strava");
  return {
    stravaConnection: strava
      ? {
          athleteId: Number(strava.accountId),
          providerAccountId: strava.accountId,
          scopes: strava.scopes ?? [],
        }
      : undefined,
  };
}

export const ensureProfile = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureProfileDoc(ctx);
    return { success: true };
  },
});

export const getTrackerState = query({
  args: {},
  handler: async (ctx) => {
  const { user, profile } = await requireViewerWithDb(ctx);
    const days = await ctx.db
      .query("trackerDays")
      .withIndex("by_auth_user_id", (q) => q.eq("authUserId", user._id))
      .collect();
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    const accounts = await auth.api.listUserAccounts({ headers });
    const settings = profile
      ? {
          defaultChecklistItems: profile.defaultChecklistItems,
          year: profile.year,
          challengeStartDate: profile.challengeStartDate,
        }
      : defaultSettings();

    return {
      user: {
        id: String(user._id),
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        image: user.image ?? undefined,
      },
      store: {
        version: 3,
        settings,
        lastShownMilestone: profile?.lastShownMilestone ?? 0,
        runEntries: days
          .map((day) =>
            buildRunEntryFromRuns({
              date: day.date,
              runs: day.runs,
              checklistItems: normalizeChecklist(
                settings.defaultChecklistItems,
                day.checklistItems,
                aggregateRuns(day.date, day.runs, day.completedOverride).completed,
              ),
              media: day.media,
              completedOverride: day.completedOverride,
              notes: day.notes,
              createdAt: day.createdAt,
            }),
          )
          .sort((a, b) => a.date.localeCompare(b.date)),
        ...formatAccounts(accounts),
      },
    };
  },
});

export const upsertRunEntry = mutation({
  args: {
    runId: v.optional(v.string()),
    date: v.string(),
    actualMiles: v.number(),
    totalTimeSeconds: v.optional(v.number()),
    avgPaceSeconds: v.optional(v.number()),
    elevationGain: v.optional(v.number()),
    notes: v.optional(v.string()),
    completedOverride: v.optional(v.boolean()),
    splits: v.array(splitArg),
    startedAt: v.optional(v.string()),
    source: v.optional(v.union(v.literal("manual"), v.literal("strava"))),
    stravaActivityId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, profile } = await ensureProfileDoc(ctx);
    const dayDocs = await ctx.db
      .query("trackerDays")
      .withIndex("by_auth_user_id", (q) => q.eq("authUserId", user._id))
      .collect();
    const now = Date.now();
    const run = createRunSegment({
      id: args.runId,
      assignedDate: args.date,
      actualMiles: args.actualMiles,
      totalTimeSeconds: args.totalTimeSeconds,
      avgPaceSeconds: args.avgPaceSeconds,
      elevationGain: args.elevationGain,
      notes: args.notes,
      splits: args.splits,
      startedAt: args.startedAt,
      source: args.source ?? "manual",
      stravaActivityId: args.stravaActivityId,
      createdAt: now,
      updatedAt: now,
    });

    let targetDoc = dayDocs.find((doc) => doc.date === args.date) ?? null;

    for (const day of dayDocs) {
      if (!args.runId || !day.runs.some((existingRun) => existingRun.id === args.runId)) {
        continue;
      }

      const remainingRuns = day.runs.filter((existingRun) => existingRun.id !== args.runId);

      if (!remainingRuns.length && day.date !== args.date) {
        await ctx.db.delete(day._id);
      } else if (day.date !== args.date) {
        await ctx.db.patch(day._id, {
          runs: remainingRuns,
          checklistItems: normalizeChecklist(
            profile.defaultChecklistItems,
            day.checklistItems,
            aggregateRuns(day.date, remainingRuns, day.completedOverride).completed,
          ),
          updatedAt: now,
        });
      } else {
        targetDoc = day;
      }
    }

    const nextRuns = targetDoc
      ? [...targetDoc.runs.filter((existingRun) => existingRun.id !== run.id), run]
      : [run];

    const nextChecklist = normalizeChecklist(
      profile.defaultChecklistItems,
      targetDoc?.checklistItems ?? [],
      aggregateRuns(args.date, nextRuns, args.completedOverride).completed,
    );

    if (targetDoc) {
      await ctx.db.patch(targetDoc._id, {
        runs: nextRuns,
        checklistItems: nextChecklist,
        completedOverride: args.completedOverride,
        updatedAt: now,
      });
      return { success: true };
    }

    await ctx.db.insert("trackerDays", {
      authUserId: user._id,
      date: args.date,
      runs: nextRuns,
      checklistItems: nextChecklist,
      media: [],
      completedOverride: args.completedOverride,
      notes: undefined,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true };
  },
});

export const deleteRunSegment = mutation({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const { user, profile } = await ensureProfileDoc(ctx);
    const days = await ctx.db
      .query("trackerDays")
      .withIndex("by_auth_user_id", (q) => q.eq("authUserId", user._id))
      .collect();

    for (const day of days) {
      if (!day.runs.some((run) => run.id === args.runId)) {
        continue;
      }

      const remainingRuns = day.runs.filter((run) => run.id !== args.runId);

      if (!remainingRuns.length) {
        await ctx.db.delete(day._id);
      } else {
        await ctx.db.patch(day._id, {
          runs: remainingRuns,
          checklistItems: normalizeChecklist(
            profile.defaultChecklistItems,
            day.checklistItems,
            aggregateRuns(day.date, remainingRuns, day.completedOverride).completed,
          ),
          updatedAt: Date.now(),
        });
      }
    }

    return { success: true };
  },
});

export const deleteRunEntry = mutation({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const { user } = await ensureProfileDoc(ctx);
    const existing = await ctx.db
      .query("trackerDays")
      .withIndex("by_auth_user_id_date", (q) =>
        q.eq("authUserId", user._id).eq("date", args.date),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return { success: true };
  },
});

export const replaceChecklist = mutation({
  args: {
    date: v.string(),
    items: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        completed: v.boolean(),
        order: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await ensureProfileDoc(ctx);
    const existing = await ctx.db
      .query("trackerDays")
      .withIndex("by_auth_user_id_date", (q) =>
        q.eq("authUserId", user._id).eq("date", args.date),
      )
      .unique();

    if (!existing) {
      return { success: false };
    }

    await ctx.db.patch(existing._id, {
      checklistItems: args.items,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const toggleChecklistItem = mutation({
  args: {
    date: v.string(),
    itemId: v.string(),
    completed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { user } = await ensureProfileDoc(ctx);
    const existing = await ctx.db
      .query("trackerDays")
      .withIndex("by_auth_user_id_date", (q) =>
        q.eq("authUserId", user._id).eq("date", args.date),
      )
      .unique();

    if (!existing) {
      return { success: false };
    }

    await ctx.db.patch(existing._id, {
      checklistItems: existing.checklistItems.map((item) =>
        item.id === args.itemId ? { ...item, completed: args.completed } : item,
      ),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const saveMedia = mutation({
  args: {
    date: v.string(),
    item: mediaArg,
  },
  handler: async (ctx, args) => {
    const { user } = await ensureProfileDoc(ctx);
    const existing = await ctx.db
      .query("trackerDays")
      .withIndex("by_auth_user_id_date", (q) =>
        q.eq("authUserId", user._id).eq("date", args.date),
      )
      .unique();

    if (!existing) {
      return { success: false };
    }

    const media =
      args.item.type === "map"
        ? [args.item, ...existing.media.filter((item) => item.type !== "map")]
        : [...existing.media.filter((item) => item.id !== args.item.id), args.item];

    await ctx.db.patch(existing._id, {
      media: media.sort((a, b) => a.order - b.order),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const deleteMedia = mutation({
  args: {
    date: v.string(),
    mediaId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await ensureProfileDoc(ctx);
    const existing = await ctx.db
      .query("trackerDays")
      .withIndex("by_auth_user_id_date", (q) =>
        q.eq("authUserId", user._id).eq("date", args.date),
      )
      .unique();

    if (!existing) {
      return { success: false };
    }

    await ctx.db.patch(existing._id, {
      media: existing.media.filter((item) => item.id !== args.mediaId),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const updateSettings = mutation({
  args: {
    defaultChecklistItems: v.optional(v.array(v.string())),
    year: v.optional(v.number()),
    challengeStartDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, profile } = await ensureProfileDoc(ctx);
    await ctx.db.patch(profile._id, {
      email: user.email,
      name: user.name,
      image: user.image ?? undefined,
      defaultChecklistItems: args.defaultChecklistItems ?? profile.defaultChecklistItems,
      year: args.year ?? profile.year,
      challengeStartDate: args.challengeStartDate ?? profile.challengeStartDate,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const clearAllData = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, profile } = await ensureProfileDoc(ctx);
    const days = await ctx.db
      .query("trackerDays")
      .withIndex("by_auth_user_id", (q) => q.eq("authUserId", user._id))
      .collect();
    for (const day of days) {
      await ctx.db.delete(day._id);
    }
    await ctx.db.patch(profile._id, {
      lastShownMilestone: 0,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const markMilestoneSeen = mutation({
  args: {
    milestone: v.number(),
  },
  handler: async (ctx, args) => {
    const { profile } = await ensureProfileDoc(ctx);
    await ctx.db.patch(profile._id, {
      lastShownMilestone: Math.max(profile.lastShownMilestone, args.milestone),
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const importStravaRuns = mutation({
  args: {
    runs: v.array(runArg),
  },
  handler: async (ctx, args) => {
    const { user, profile } = await ensureProfileDoc(ctx);
    const days = await ctx.db
      .query("trackerDays")
      .withIndex("by_auth_user_id", (q) => q.eq("authUserId", user._id))
      .collect();
    const byDate = new Map(days.map((day) => [day.date, day]));
    const existingActivityIds = new Set(
      days.flatMap((day) =>
        day.runs.map((run) => run.stravaActivityId).filter(Boolean),
      ),
    );
    let importedCount = 0;

    for (const run of args.runs) {
      if (run.stravaActivityId && existingActivityIds.has(run.stravaActivityId)) {
        continue;
      }

      const day = byDate.get(run.assignedDate);
      const nextRuns = [...(day?.runs ?? []), run];
      const nextChecklist = normalizeChecklist(
        profile.defaultChecklistItems,
        day?.checklistItems ?? [],
        aggregateRuns(run.assignedDate, nextRuns, day?.completedOverride).completed,
      );

      if (day) {
        await ctx.db.patch(day._id, {
          runs: nextRuns,
          checklistItems: nextChecklist,
          updatedAt: Date.now(),
        });
      } else {
        const id = await ctx.db.insert("trackerDays", {
          authUserId: user._id,
          date: run.assignedDate,
          runs: nextRuns,
          checklistItems: nextChecklist,
          media: [],
          completedOverride: undefined,
          notes: undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const inserted = await ctx.db.get(id);
        if (inserted) {
          byDate.set(inserted.date, inserted);
        }
      }

      if (run.stravaActivityId) {
        existingActivityIds.add(run.stravaActivityId);
      }
      importedCount += 1;
    }

    return { importedCount };
  },
});

export const latestDevEmail = query({
  args: {
    email: v.string(),
    kind: v.union(v.literal("verification"), v.literal("reset"), v.literal("change-email")),
  },
  handler: async (ctx, args) => {
    if (process.env.NODE_ENV === "production") {
      return null;
    }

    const items = await ctx.db
      .query("authEmails")
      .withIndex("by_email_kind", (q) => q.eq("email", args.email).eq("kind", args.kind))
      .order("desc")
      .take(1);

    return items[0] ?? null;
  },
});

export const addEmailLogin = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.setPassword({
      headers,
      body: {
        newPassword: args.password,
      },
    });
    await auth.api.changeEmail({
      headers,
      body: {
        newEmail: args.email,
        callbackURL: `${process.env.SITE_URL ?? "http://localhost:3000"}/dashboard`,
      },
    });
    return { success: true };
  },
});

export const changeEmailAddress = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.changeEmail({
      headers,
      body: {
        newEmail: args.email,
        callbackURL: `${process.env.SITE_URL ?? "http://localhost:3000"}/dashboard`,
      },
    });
    return { success: true };
  },
});

export const disconnectStrava = mutation({
  args: {
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.unlinkAccount({
      headers,
      body: {
        providerId: "strava",
        accountId: args.accountId,
      },
    });
    return { success: true };
  },
});
