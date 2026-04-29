function normalizeSiteUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function getSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;

  if (!value) {
    throw new Error(
      "Missing NEXT_PUBLIC_SITE_URL or SITE_URL. Set the production site URL explicitly.",
    );
  }

  return normalizeSiteUrl(value);
}

export function getAuthBaseUrl() {
  return `${getSiteUrl()}/api/auth`;
}

export function getStravaOAuthCallbackUrl() {
  return `${getAuthBaseUrl()}/oauth2/callback/strava`;
}

