export type MediaType = "photo" | "map";
export type RunSource = "manual" | "strava";

export type Split = {
  id: string;
  mileNumber: number;
  paceSeconds: number;
};

export type ChecklistItem = {
  id: string;
  label: string;
  completed: boolean;
  order: number;
};

export type MediaItem = {
  id: string;
  type: MediaType;
  url: string;
  name: string;
  order: number;
  createdAt: number;
};

export type RunSegment = {
  id: string;
  assignedDate: string;
  actualMiles: number;
  totalTimeSeconds?: number;
  avgPaceSeconds?: number;
  elevationGain?: number;
  notes?: string;
  splits: Split[];
  stravaActivityId?: string;
  source?: RunSource;
  startedAt?: string;
  createdAt: number;
  updatedAt: number;
};

export type RunEntry = {
  id: string;
  date: string;
  requiredMiles: number;
  actualMiles: number;
  totalTimeSeconds?: number;
  avgPaceSeconds?: number;
  elevationGain?: number;
  notes?: string;
  completed: boolean;
  completedOverride?: boolean;
  splits: Split[];
  runs: RunSegment[];
  checklistItems: ChecklistItem[];
  media: MediaItem[];
  stravaActivityId?: string;
  source?: RunSource;
  createdAt: number;
  updatedAt: number;
};

export type UserSettings = {
  defaultChecklistItems: string[];
  year: number;
  challengeStartDate: string;
};

export type StravaConnection = {
  athleteId: number;
  providerAccountId: string;
  scopes: string[];
};

export type TrackerStore = {
  version: number;
  settings: UserSettings;
  runEntries: RunEntry[];
  stravaConnection?: StravaConnection;
  lastShownMilestone?: number;
};
