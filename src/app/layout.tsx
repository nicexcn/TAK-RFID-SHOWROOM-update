import type { Metadata, Viewport } from "next";
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
  title: "NimitrLog",
  description: "LAMITAK RFID Showroom",
  manifest: "/manifest.webmanifest",
  // iOS: lets it run standalone (Add to Home Screen) so notification sound/alerts work.
  appleWebApp: { capable: true, statusBarStyle: "default", title: "NimitrLog" },
  icons: { icon: "/icon-192.png", apple: "/apple-icon.png" },
};

// Mobile-first responsive: scale to the device width.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#726c5a",
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
