import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAppRole, roleHomes } from "@/lib/roles";

const protectedPaths = ["/alumno", "/docente", "/admin"];

export async function middleware(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const protectedRequest = protectedPaths.some((prefix) => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`));
    return protectedRequest ? NextResponse.redirect(new URL("/login", request.url)) : NextResponse.next();
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (path === "/acceso-pendiente") return response;
  const isProtected = protectedPaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (!user && isProtected) return NextResponse.redirect(new URL("/login", request.url));
  if (!user) return response;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isAppRole(profile?.role)) return NextResponse.redirect(new URL("/acceso-pendiente", request.url));
  const home = roleHomes[profile.role];
  if (path === "/" || path === "/login" || path === "/registro") return NextResponse.redirect(new URL(home, request.url));
  const requiredRole = protectedPaths.find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (requiredRole && requiredRole !== home) return NextResponse.redirect(new URL(home, request.url));
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
