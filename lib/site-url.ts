function normalizeSiteUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
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

export function getTrustedOrigins() {
  const localOrigins = ["http://localhost:3000", "http://localhost:3001"];
  const siteUrl = getSiteUrl();
  const localhostVariant = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(siteUrl)
    ? [siteUrl]
    : [];

  return Array.from(
    new Set([
      ...localOrigins,
      ...localhostVariant,
      "https://rtd-three.vercel.app",
      siteUrl,
    ]),
  );
}
