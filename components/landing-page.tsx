import Link from "next/link";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="animate-slide-in-title font-display text-6xl leading-none tracking-tight text-[var(--ink)] sm:text-8xl">
          Run the Date.
        </h1>
        <Link href="/sign-in" className="btn btn-primary mt-8">
          Sign in
        </Link>
      </div>
    </div>
  );
}
