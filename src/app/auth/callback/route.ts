import { NextResponse, type NextRequest } from "next/server";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return NextResponse.redirect(new URL("/login?error=enlace", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/";
  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const nextUrl = new URL(requestedNext, request.url);
        if (nextUrl.origin === request.nextUrl.origin && requestedNext.startsWith("/") && !requestedNext.startsWith("//")) {
          return NextResponse.redirect(nextUrl);
        }
        return NextResponse.redirect(new URL("/", request.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/login?error=enlace", request.url));
    }
  }
  return NextResponse.redirect(new URL("/login?error=enlace", request.url));
}
