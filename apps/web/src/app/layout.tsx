import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EngiCite | Engineering document control and intelligence", template: "%s · EngiCite" },
  description: "EngiCite gives oil-and-gas project teams secure MDR control, discipline-based submissions, revision governance and evidence-backed document intelligence.",
  icons: { icon: "/engicite-logo-transparent.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="h-full antialiased"><body className="min-h-full font-sans">{children}</body></html>;
}
