import Link from "next/link";

export default function AuthLayout({children}:{children:React.ReactNode}) {
  return <main className="auth-shell"><aside className="auth-side"><Link className="brand" href="/"><span className="brand-mark">B</span><span>Banco Académico</span></Link><div className="auth-quote"><span className="eyebrow">Tu vida académica, en orden</span><h2>Un espacio para avanzar.</h2><p>Consulta tus materias, organiza tu horario y mantente al día con tu comunidad académica.</p></div><div className="auth-foot">Instituto Tecnológico de San Luis Potosí</div></aside><section className="auth-main"><div className="auth-card">{children}</div></section></main>;
}
