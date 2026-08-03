import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EngiVault AI", template: "%s · EngiVault AI" },
  description: "Secure engineering document intelligence for controlled project teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
