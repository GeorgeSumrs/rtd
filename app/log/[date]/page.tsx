import { DayPage } from "@/components/tracker-pages";
import { requireAuth } from "@/lib/page-auth";

export default async function Page(props: PageProps<"/log/[date]">) {
  await requireAuth();
  const { date } = await props.params;
  return <DayPage date={date} />;
}
