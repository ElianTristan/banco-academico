import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Banco Académico | ITSLP",
  description: "Plataforma académica del Instituto Tecnológico de San Luis Potosí.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
