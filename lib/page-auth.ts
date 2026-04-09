import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";

export async function requireAuth() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }
}

export async function redirectIfAuthenticated(path = "/dashboard") {
  if (await isAuthenticated()) {
    redirect(path);
  }
}
