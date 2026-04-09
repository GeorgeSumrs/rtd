import { calculatePace, createRunSegment } from "@/lib/challenge";
import type { RunSegment } from "@/lib/types";

const STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";
const METERS_PER_MILE = 1609.344;
const STRAVA_ACTIVITIES_PER_PAGE = 200;
const STRAVA_MAX_ACTIVITY_PAGES = 25;

export type StravaActivity = {
  id: number;
  name: string;
  type: string;
  distance: number;
  moving_time: number;
  average_speed?: number | null;
  start_date_local: string;
};

export function metersToMiles(meters: number) {
  return Number((meters / METERS_PER_MILE).toFixed(2));
}

export function mapStravaActivityToRun(
  activity: StravaActivity,
  assignedDate: string,
) {
  const actualMiles = metersToMiles(activity.distance);
  const totalTimeSeconds = activity.moving_time;
  const avgPaceSeconds =
    activity.average_speed && activity.average_speed > 0
      ? Math.round(METERS_PER_MILE / activity.average_speed)
      : totalTimeSeconds && actualMiles > 0
        ? calculatePace(actualMiles, totalTimeSeconds)
        : undefined;

  return createRunSegment({
    assignedDate,
    actualMiles,
    totalTimeSeconds,
    avgPaceSeconds,
    elevationGain: undefined,
    notes: undefined,
    splits: [],
    stravaActivityId: String(activity.id),
    source: "strava" as const,
    startedAt: activity.start_date_local,
  }) satisfies RunSegment;
}

async function fetchStravaActivitiesPage(accessToken: string, page: number) {
  const url = new URL(STRAVA_ACTIVITIES_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(STRAVA_ACTIVITIES_PER_PAGE));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Strava activities request failed: ${body || response.statusText}`);
  }

  return (await response.json()) as StravaActivity[];
}

export async function fetchStravaActivities({
  accessToken,
}: {
  accessToken: string;
}) {
  const activities: StravaActivity[] = [];

  for (let page = 1; page <= STRAVA_MAX_ACTIVITY_PAGES; page += 1) {
    const batch = await fetchStravaActivitiesPage(accessToken, page);
    activities.push(...batch);

    if (batch.length < STRAVA_ACTIVITIES_PER_PAGE) {
      break;
    }
  }

  return activities;
}
