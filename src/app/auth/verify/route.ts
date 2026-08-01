import { NextResponse, type NextRequest } from "next/server";
import { consumeLoginToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing", request.url));
  }

  const user = await consumeLoginToken(token);
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=expired", request.url));
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
