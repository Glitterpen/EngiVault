import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EngiCite | Engineering intelligence, evidenced", template: "%s · EngiCite" },
  description: "EngiCite is building secure, evidence-grounded document intelligence for engineering teams. Request early access.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="h-full antialiased"><body className="min-h-full font-sans">{children}</body></html>;
}
