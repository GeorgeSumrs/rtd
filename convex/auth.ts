import { betterAuth } from "better-auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

const STRAVA_ATHLETE_URL = "https://www.strava.com/api/v3/athlete";
const PLACEHOLDER_EMAIL_DOMAIN = "strava.rtd.local";

function getBaseUrl() {
  return process.env.SITE_URL ?? "http://localhost:3000";
}

function getAuthSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing BETTER_AUTH_SECRET.");
  }
  return secret;
}

function getStravaCredentials() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET.");
  }

  return { clientId, clientSecret };
}

function placeholderEmailForStrava(athleteId: string) {
  return `strava-${athleteId}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_FROM_EMAIL;

  if (!apiKey || !from) {
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend failed: ${body || response.statusText}`);
  }

  return true;
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function storeDevEmail(
  ctx: GenericCtx<DataModel>,
  input: {
    email: string;
    kind: "verification" | "reset" | "change-email";
    subject: string;
    url: string;
    token: string;
  },
) {
  const db = (ctx as { db?: { insert: (table: "authEmails", value: typeof input & { createdAt: number }) => Promise<unknown> } }).db;
  if (!db) {
    return;
  }
  await db.insert("authEmails", {
    ...input,
    createdAt: Date.now(),
  });
}

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: `${getBaseUrl()}/api/auth`,
    secret: getAuthSecret(),
    database: authComponent.adapter(ctx),
    trustedOrigins: [getBaseUrl()],
    appName: "RTD Tracker",
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({
        user,
        url,
        token,
      }: {
        user: { email: string };
        url: string;
        token: string;
      }) => {
        const delivered = await sendEmail({
          to: user.email,
          subject: "Reset your RTD Tracker password",
          html: `<p>Use the link below to reset your RTD Tracker password.</p><p><a href="${escapeHtml(
            url,
          )}">${escapeHtml(url)}</a></p>`,
        });

        if (!delivered) {
          await storeDevEmail(ctx, {
            email: user.email,
            kind: "reset",
            subject: "Reset your RTD Tracker password",
            url,
            token,
          });
        }
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({
        user,
        url,
        token,
      }: {
        user: { email: string };
        url: string;
        token: string;
      }) => {
        const delivered = await sendEmail({
          to: user.email,
          subject: "Verify your RTD Tracker email",
          html: `<p>Verify your RTD Tracker account with the link below.</p><p><a href="${escapeHtml(
            url,
          )}">${escapeHtml(url)}</a></p>`,
        });

        if (!delivered) {
          await storeDevEmail(ctx, {
            email: user.email,
            kind: "verification",
            subject: "Verify your RTD Tracker email",
            url,
            token,
          });
        }
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailVerification: async ({
          newEmail,
          url,
          token,
        }: {
          newEmail: string;
          url: string;
          token: string;
        }) => {
          const delivered = await sendEmail({
            to: newEmail,
            subject: "Confirm your RTD Tracker email change",
            html: `<p>Confirm your RTD Tracker email change with the link below.</p><p><a href="${escapeHtml(
              url,
            )}">${escapeHtml(url)}</a></p>`,
          });

          if (!delivered) {
            await storeDevEmail(ctx, {
              email: newEmail,
              kind: "change-email",
              subject: "Confirm your RTD Tracker email change",
              url,
              token,
            });
          }
        },
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
      },
    },
    plugins: [
      convex({ authConfig }),
      genericOAuth({
        config: [
          {
            providerId: "strava",
            clientId: getStravaCredentials().clientId,
            clientSecret: getStravaCredentials().clientSecret,
            authorizationUrl: "https://www.strava.com/oauth/authorize",
            tokenUrl: "https://www.strava.com/oauth/token",
            scopes: ["read,activity:read_all,profile:read_all"],
            authorizationUrlParams: {
              approval_prompt: "auto",
            },
            getUserInfo: async (tokens) => {
              const response = await fetch(STRAVA_ATHLETE_URL, {
                headers: {
                  Authorization: `Bearer ${tokens.accessToken}`,
                },
              });

              if (!response.ok) {
                return null;
              }

              const athlete = (await response.json()) as {
                id: number;
                firstname?: string;
                lastname?: string;
                profile_medium?: string;
              };

              const athleteId = String(athlete.id);
              const name = [athlete.firstname, athlete.lastname]
                .filter(Boolean)
                .join(" ")
                .trim();

              return {
                id: athleteId,
                email: placeholderEmailForStrava(athleteId),
                emailVerified: true,
                name: name || `Strava athlete ${athleteId}`,
                image: athlete.profile_medium,
              };
            },
          },
        ],
      }),
    ],
  });
