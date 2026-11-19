import { NextResponse, type NextRequest } from "next/server";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return NextResponse.redirect(new URL("/recuperar?error=enlace", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const tokenType = request.nextUrl.searchParams.get("type");
  const providerError = request.nextUrl.searchParams.get("error");
  const providerErrorCode = request.nextUrl.searchParams.get("error_code");
  const allowedNext = new Set(["/", "/recuperar/nueva", "/alumno?auth=success"]);
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/";
  if (providerError || providerErrorCode || !allowedNext.has(requestedNext)) {
    return NextResponse.redirect(new URL("/recuperar?error=enlace", request.url));
  }

  try {
    const supabase = await createClient();
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return NextResponse.redirect(new URL("/recuperar?error=enlace", request.url));
    } else if (tokenHash && (tokenType === "recovery" || tokenType === "email")) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: tokenType,
      });
      if (error) return NextResponse.redirect(new URL("/recuperar?error=enlace", request.url));
    } else {
      return NextResponse.redirect(new URL("/recuperar?error=enlace", request.url));
    }

    return NextResponse.redirect(new URL(requestedNext, request.url));
  } catch (error) {
    console.error("Authentication callback could not complete the Supabase flow.", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.redirect(new URL("/recuperar?error=enlace", request.url));
  }
}
