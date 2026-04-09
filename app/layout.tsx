import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { TrackerProvider } from "@/components/tracker-provider";
import { getToken } from "@/lib/auth-server";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Run the Day Tracker",
  description: "Track the Run the Day challenge with quick logs, progress charts, streaks, and a full-year calendar heatmap.",
};

function getServerTodayIso() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialTodayIso = getServerTodayIso();
  const initialToken = await getToken();
  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ConvexClientProvider initialToken={initialToken}>
          <TrackerProvider initialTodayIso={initialTodayIso}>
            <AppShell>{children}</AppShell>
          </TrackerProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
