import { NextResponse, type NextRequest } from "next/server";
import { consumeLoginToken } from "@/lib/auth";

/**
 * Redirects with a relative Location on purpose.
 *
 * Building an absolute URL from `request.url` resolves to whatever address the
 * server is bound to (0.0.0.0 in a container), not the host the coach typed.
 * The browser would then land on a different origin than the one the session
 * cookie was set for and appear signed out. A relative target keeps them on
 * their own origin behind any proxy or custom domain.
 */
function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return redirectTo("/login?error=missing");

  const user = await consumeLoginToken(token);
  if (!user) return redirectTo("/login?error=expired");

  return redirectTo("/dashboard");
}
