import { SignUpCard } from "@/components/auth-pages";
import { redirectIfAuthenticated } from "@/lib/page-auth";

export default async function Page() {
  await redirectIfAuthenticated();
  return <SignUpCard />;
}
