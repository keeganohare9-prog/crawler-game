import type { Metadata } from "next";
import "./globals.css";

const pagesRepository = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "crawler-game";
const publicBasePath = process.env.GITHUB_PAGES === "true" ? `/${pagesRepository}` : "";

export const metadata: Metadata = {
  title: "Signal Depths — 8-bit dungeon game",
  description: "Fight through twelve unknown rooms, master six weapons, thrill the audience, and escape the live-broadcast dungeon.",
  openGraph: {
    title: "Signal Depths — 8-bit dungeon game",
    description: "Twelve unknown rooms. Six weapons. One live audience demanding a spectacular escape.",
    images: [{ url: `${publicBasePath}/signal-depths-social.png`, width: 1672, height: 941, alt: "Signal Depths pixel-art dungeon broadcast" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Signal Depths — 8-bit dungeon game",
    description: "Twelve unknown rooms. Six weapons. One live audience demanding a spectacular escape.",
    images: [`${publicBasePath}/signal-depths-social.png`],
  },
  icons: {
    icon: `${publicBasePath}/favicon.svg`,
    shortcut: `${publicBasePath}/favicon.svg`,
  },
};

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
