import { SignInCard } from "@/components/auth-pages";
import { redirectIfAuthenticated } from "@/lib/page-auth";

export default async function Page() {
  await redirectIfAuthenticated();
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-8">
      <SignInCard />
    </div>
  );
}
