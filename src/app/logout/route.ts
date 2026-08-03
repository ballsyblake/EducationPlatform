import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth";

// Relative Location, for the same reason as /auth/verify: `request.url` is the
// address the server is bound to inside a container, not the host the coach is
// browsing, and redirecting across origins drops the session cookie.
function toLogin() {
  return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
}

export async function POST() {
  await endSession();
  return toLogin();
}

export async function GET() {
  await endSession();
  return toLogin();
}
