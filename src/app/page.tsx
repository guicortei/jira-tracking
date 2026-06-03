import { LoginScreen } from "@/components/login-screen";
import { HomePage } from "@/components/home-page";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const isAuthenticated = await verifySessionToken(token);

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <HomePage />
    </div>
  );
}
