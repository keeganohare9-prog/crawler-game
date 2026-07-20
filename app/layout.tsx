import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Signal Depths — 8-bit dungeon game",
  description: "Fight through twelve unknown rooms, master six weapons, thrill the audience, and escape the live-broadcast dungeon.",
  openGraph: {
    title: "Signal Depths — 8-bit dungeon game",
    description: "Twelve unknown rooms. Six weapons. One live audience demanding a spectacular escape.",
    images: [{ url: "/signal-depths-social.png", width: 1672, height: 941, alt: "Signal Depths pixel-art dungeon broadcast" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Signal Depths — 8-bit dungeon game",
    description: "Twelve unknown rooms. Six weapons. One live audience demanding a spectacular escape.",
    images: ["/signal-depths-social.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
