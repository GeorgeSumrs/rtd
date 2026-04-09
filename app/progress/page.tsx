import { ProgressPage } from "@/components/tracker-pages";
import { requireAuth } from "@/lib/page-auth";

export default async function Page() {
  await requireAuth();
  return <ProgressPage />;
}
