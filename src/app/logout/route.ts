import { NextResponse, type NextRequest } from "next/server";
import { endSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  await endSession();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}

export async function GET(request: NextRequest) {
  await endSession();
  return NextResponse.redirect(new URL("/login", request.url));
}
