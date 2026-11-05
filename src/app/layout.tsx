import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appInfo } from "@/lib/app-info";

export const metadata: Metadata = {
  title: `${appInfo.name} | ${appInfo.institution}`,
  description: `Plataforma académica del ${appInfo.institution}.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f5fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1727" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
