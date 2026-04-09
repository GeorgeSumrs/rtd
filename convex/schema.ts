import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const splitValidator = v.object({
  id: v.string(),
  mileNumber: v.number(),
  paceSeconds: v.number(),
});

const checklistItemValidator = v.object({
  id: v.string(),
  label: v.string(),
  completed: v.boolean(),
  order: v.number(),
});

const mediaItemValidator = v.object({
  id: v.string(),
  type: v.union(v.literal("photo"), v.literal("map")),
  url: v.string(),
  name: v.string(),
  order: v.number(),
  createdAt: v.number(),
});

const runSegmentValidator = v.object({
  id: v.string(),
  assignedDate: v.string(),
  actualMiles: v.number(),
  totalTimeSeconds: v.optional(v.number()),
  avgPaceSeconds: v.optional(v.number()),
  elevationGain: v.optional(v.number()),
  notes: v.optional(v.string()),
  splits: v.array(splitValidator),
  stravaActivityId: v.optional(v.string()),
  source: v.optional(v.union(v.literal("manual"), v.literal("strava"))),
  startedAt: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export default defineSchema({
  profiles: defineTable({
    authUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    defaultChecklistItems: v.array(v.string()),
    year: v.number(),
    challengeStartDate: v.string(),
    lastShownMilestone: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_auth_user_id", ["authUserId"]),
  trackerDays: defineTable({
    authUserId: v.string(),
    date: v.string(),
    runs: v.array(runSegmentValidator),
    checklistItems: v.array(checklistItemValidator),
    media: v.array(mediaItemValidator),
    completedOverride: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_auth_user_id", ["authUserId"])
    .index("by_auth_user_id_date", ["authUserId", "date"]),
  authEmails: defineTable({
    email: v.string(),
    kind: v.union(v.literal("verification"), v.literal("reset"), v.literal("change-email")),
    subject: v.string(),
    url: v.string(),
    token: v.string(),
    createdAt: v.number(),
  }).index("by_email_kind", ["email", "kind"]),
});
