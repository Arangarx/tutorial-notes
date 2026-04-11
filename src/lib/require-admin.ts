import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";

/**
 * Call at the top of every mutating server action.
 * Redirects to /login if the session is invalid, making CSRF/unauthenticated
 * mutation impossible even if the middleware is bypassed.
 */
export async function requireAdminSession(): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login");
  }
}
