import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

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
      <body>
        <Navbar />
        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}