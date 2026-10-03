import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const nextUrl = new URL(requestedNext, request.url);
      if (nextUrl.origin === request.nextUrl.origin && requestedNext.startsWith("/") && !requestedNext.startsWith("//")) {
        return NextResponse.redirect(nextUrl);
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
  }
  return NextResponse.redirect(new URL("/login?error=enlace", request.url));
}
