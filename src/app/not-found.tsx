import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-50">
      <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.45)] backdrop-blur-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Banco Académico</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Página no encontrada</h1>
        <p className="mt-4 text-sm leading-7 text-slate-300">
          La ruta que buscas no existe o ya no está disponible. Puedes volver al inicio o acceder a la experiencia de autenticación.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
            Volver al inicio
          </Link>
          <Link href="/auth" className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/0 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
            Ir a autenticación
          </Link>
        </div>
      </div>
    </main>
  );
}
