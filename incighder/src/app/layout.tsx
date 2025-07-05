import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Incighder - Artist Data Insights",
  description: "Discover and analyze artist data from Spotify.",
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