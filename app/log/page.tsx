import Link from "next/link";
import { toIsoDate } from "@/lib/challenge";
import { requireAuth } from "@/lib/page-auth";

export default async function Page() {
  await requireAuth();
  const todayIso = toIsoDate(new Date());

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="text-center">
        <h1 className="mt-2 font-display text-4xl tracking-tight text-[var(--ink)]">
          Choose a run to log
        </h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Link
          href={`/log/${todayIso}`}
          className="flex min-h-[260px] flex-col items-center justify-center rounded-[30px] border border-[var(--line)] bg-white p-6 text-center shadow-[0_18px_45px_rgba(32,44,37,0.08)] transition hover:-translate-y-0.5"
        >
          <h2 className="font-display text-3xl tracking-tight text-[var(--ink)]">
            Log today
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Open today&apos;s log page and add or edit runs for the current day.
          </p>
        </Link>

        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[30px] border border-[var(--line)] bg-white p-6 text-center shadow-[0_18px_45px_rgba(32,44,37,0.08)]">
          <h2 className="font-display text-3xl tracking-tight text-[var(--ink)]">
            Log a past day
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Pick any earlier date and jump straight to that day&apos;s run page.
          </p>
          <form action="/log" className="mt-5 flex flex-col gap-3">
            <input type="date" name="date" max={todayIso} className="field" />
            <button
              type="submit"
              formAction={async (formData) => {
                "use server";
                const { redirect } = await import("next/navigation");
                const date = formData.get("date");
                if (typeof date === "string" && date) {
                  redirect(`/log/${date}`);
                }
                redirect("/log");
              }}
              className="btn btn-primary"
            >
              Open past day
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
