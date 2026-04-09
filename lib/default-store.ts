import { defaultSettings } from "@/lib/challenge";
import type { TrackerStore } from "@/lib/types";

export function createEmptyStore(today = new Date()): TrackerStore {
  return {
    version: 3,
    settings: defaultSettings(today),
    runEntries: [],
    stravaConnection: undefined,
    lastShownMilestone: 0,
  };
}
