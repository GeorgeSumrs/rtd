"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";

function AuthFrame({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-[34px] border border-[var(--line)] bg-white p-8 shadow-[0_24px_50px_rgba(32,44,37,0.08)]">
      {eyebrow ? (
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">{eyebrow}</p>
      ) : null}
      <h1 className="mt-3 font-display text-4xl tracking-tight text-[var(--ink)]">
        {title}
      </h1>
      {body ? <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{body}</p> : null}
      <div className="mt-8">{children}</div>
    </div>
  );
}

function DevEmailNotice({
  email,
  kind,
}: {
  email: string;
  kind: "verification" | "reset" | "change-email";
}) {
  const item = useQuery(
    api.tracker.latestDevEmail,
    email ? { email, kind } : "skip",
  );

  if (!item) {
    return null;
  }

  return (
    <div className="rounded-[24px] border border-[var(--line)] bg-[var(--slate-soft)] p-4 text-sm text-[var(--muted)]">
      <p className="font-semibold text-[var(--ink)]">Development inbox</p>
      <p className="mt-2">
        No email provider is configured, so the latest auth email is available here.
      </p>
      <a href={item.url} className="mt-3 inline-flex text-[var(--accent)] underline underline-offset-4">
        Open latest {kind === "reset" ? "reset" : "verification"} link
      </a>
    </div>
  );
}

export function SignInCard() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"signin" | "strava" | "reset" | null>(null);

  return (
    <AuthFrame
      eyebrow="Sign in"
      title="Sign in to RTD Tracker"
      body="Use email and password or sign in with Strava. If you already have an email account, Strava must be linked explicitly from settings."
    >
      <div className="space-y-6">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy("signin");
            setError(null);
            setStatus(null);
            try {
              const result = await authClient.signIn.email({
                email,
                password,
                callbackURL: "/dashboard",
              });
              if (result.error) {
                throw new Error(result.error.message);
              }
              router.push("/dashboard");
              router.refresh();
            } catch (nextError) {
              const message =
                nextError instanceof Error ? nextError.message : "Unable to sign in.";
              setError(
                message.includes("account not linked")
                  ? "That Strava identity is not linked to this account yet. Sign in with the original method first, then connect Strava from settings."
                  : message,
              );
            } finally {
              setBusy(null);
            }
          }}
        >
          <label className="block space-y-2 text-sm text-[var(--muted)]">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field"
              required
            />
          </label>
          <label className="block space-y-2 text-sm text-[var(--muted)]">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field"
              required
            />
          </label>
          <button type="submit" className="btn btn-primary w-full" disabled={busy !== null}>
            {busy === "signin" ? "Signing in..." : "Sign in with email"}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-secondary w-full"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("strava");
            setError(null);
            setStatus(null);
            try {
              await authClient.signIn.oauth2({
                providerId: "strava",
                callbackURL: "/dashboard",
              });
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : "Unable to start Strava sign-in.");
              setBusy(null);
            }
          }}
        >
          {busy === "strava" ? "Redirecting to Strava..." : "Sign in with Strava"}
        </button>

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {status ? <p className="text-sm text-[var(--muted)]">{status}</p> : null}

        <p className="text-sm text-[var(--muted)]">
          Need an account?{" "}
          <Link href="/sign-up" className="text-[var(--accent)] underline underline-offset-4">
            Create one
          </Link>
        </p>
      </div>
    </AuthFrame>
  );
}

export function SignUpCard() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState<"signup" | "strava" | null>(null);

  return (
    <AuthFrame
      eyebrow="Sign up"
      title="Create your RTD Tracker account"
      body="Start with email and password or start with Strava and add email credentials later."
    >
      <div className="space-y-6">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy("signup");
            setError(null);
            setStatus(null);
            try {
              const result = await authClient.signUp.email({
                name,
                email,
                password,
                callbackURL: "/dashboard",
              });
              if (result.error) {
                throw new Error(result.error.message);
              }
              setPendingEmail(email);
              setStatus("Account created. Verify your email to complete sign-in.");
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : "Unable to create account.");
            } finally {
              setBusy(null);
            }
          }}
        >
          <label className="block space-y-2 text-sm text-[var(--muted)]">
            <span>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field"
              required
            />
          </label>
          <label className="block space-y-2 text-sm text-[var(--muted)]">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field"
              required
            />
          </label>
          <label className="block space-y-2 text-sm text-[var(--muted)]">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field"
              minLength={8}
              required
            />
          </label>
          <button type="submit" className="btn btn-primary w-full" disabled={busy !== null}>
            {busy === "signup" ? "Creating account..." : "Create account"}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-secondary w-full"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("strava");
            setError(null);
            try {
              await authClient.signIn.oauth2({
                providerId: "strava",
                callbackURL: "/dashboard",
              });
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : "Unable to start Strava sign-up.");
              setBusy(null);
            }
          }}
        >
          {busy === "strava" ? "Redirecting to Strava..." : "Start with Strava"}
        </button>

        {pendingEmail ? <DevEmailNotice email={pendingEmail} kind="verification" /> : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {status ? <p className="text-sm text-[var(--muted)]">{status}</p> : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!pendingEmail}
            onClick={async () => {
              if (!pendingEmail) return;
              setError(null);
              setStatus(null);
              try {
                await authClient.sendVerificationEmail({
                  email: pendingEmail,
                  callbackURL: "/dashboard",
                });
                setStatus("Verification email sent again.");
              } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : "Unable to resend verification email.");
              }
            }}
          >
            Resend verification email
          </button>
          <Link href="/sign-in" className="btn btn-ghost">
            Back to sign in
          </Link>
        </div>
      </div>
    </AuthFrame>
  );
}

export function ResetPasswordCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const token = useMemo(() => searchParams.get("token"), [searchParams]);
  const resetError = searchParams.get("error");

  return (
    <AuthFrame
      eyebrow="Reset"
      title="Set a new password"
      body="Choose a new password for your RTD Tracker account."
    >
      <div className="space-y-4">
        {resetError ? (
          <p className="text-sm text-[var(--danger)]">
            This reset link is invalid or expired. Request a new one from the sign-in page.
          </p>
        ) : null}
        {!token ? (
          <p className="text-sm text-[var(--muted)]">
            Open this page from a password reset email.
          </p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setStatus(null);
              if (password !== confirmPassword) {
                setError("Passwords do not match.");
                return;
              }
              setBusy(true);
              try {
                await authClient.resetPassword({
                  newPassword: password,
                  token,
                });
                setStatus("Password reset. Redirecting to sign in...");
                setTimeout(() => {
                  router.push("/sign-in");
                }, 900);
              } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : "Unable to reset password.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block space-y-2 text-sm text-[var(--muted)]">
              <span>New password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                className="field"
                required
              />
            </label>
            <label className="block space-y-2 text-sm text-[var(--muted)]">
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                className="field"
                required
              />
            </label>
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? "Saving..." : "Set new password"}
            </button>
          </form>
        )}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {status ? <p className="text-sm text-[var(--muted)]">{status}</p> : null}
      </div>
    </AuthFrame>
  );
}
