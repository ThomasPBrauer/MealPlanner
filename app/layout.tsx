import type { Metadata } from "next";
import "./globals.css";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import { googleFontsHrefs } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "The Weekly Board — Meal Planner",
  description: "Drag recipes from the pantry onto your weekly menu board.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* every selectable font, in a few small requests (see lib/fonts.ts) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {googleFontsHrefs().map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body className="font-body">
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
