import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host =
    incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol =
    incoming.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "LO2S Pattern Lab — LED Test Pattern Generator",
    description:
      "Metric LED test patterns, linked wall calculations and Resolume pixel maps for LO2S technical production teams.",
    icons: {
      icon: "/brand/lo2s-pattern-lab-icon.png",
      shortcut: "/brand/lo2s-pattern-lab-icon.png",
      apple: "/brand/lo2s-pattern-lab-icon.png",
    },
    openGraph: {
      title: "LO2S Pattern Lab",
      description: "Metric LED test patterns and Resolume pixel-map exports for technical production.",
      type: "website",
      images: [
        {
          url: `${origin}/brand/github-social-preview.png`,
          width: 1280,
          height: 640,
          alt: "LO2S Pattern Lab",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "LO2S Pattern Lab",
      description: "Metric LED test patterns and Resolume pixel-map exports for technical production.",
      images: [`${origin}/brand/github-social-preview.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
