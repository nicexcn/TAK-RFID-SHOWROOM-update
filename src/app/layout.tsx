import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Archer — Latin slab-serif (no Thai glyphs). Weights mirror the app's original @font-face.
// next/font self-hosts + preloads these and generates a metrics-matched fallback (less CLS).
const archer = localFont({
  variable: "--font-archer",
  display: "swap",
  src: [
    { path: "../../public/fonts/Archer Font/Archer Thin.otf", weight: "100", style: "normal" },
    { path: "../../public/fonts/Archer Font/Archer Light.otf", weight: "300", style: "normal" },
    { path: "../../public/fonts/Archer Font/Archer Book.otf", weight: "400", style: "normal" },
    { path: "../../public/fonts/Archer-Semibold.otf", weight: "600", style: "normal" },
    { path: "../../public/fonts/Archer Font/Archer Bold.otf", weight: "700", style: "normal" },
  ],
});

// DB Heavent — Thai face. size-adjust:112% + the deliberate weight remap (300–500→Li, 600→Med,
// 700→Bd) EXACTLY as the original @font-face; adjustFontFallback off since Latin never uses it.
const dbHeavent = localFont({
  variable: "--font-heavent",
  display: "swap",
  adjustFontFallback: false,
  declarations: [{ prop: "size-adjust", value: "112%" }],
  src: [
    { path: "../../public/fonts/DB-Heavent-Li.ttf", weight: "300 500", style: "normal" },
    { path: "../../public/fonts/DB-Heavent-Med.ttf", weight: "600", style: "normal" },
    { path: "../../public/fonts/DB-Heavent-Bd.ttf", weight: "700", style: "normal" },
  ],
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
    <html lang="en" className={`${archer.variable} ${dbHeavent.variable}`}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Focus-source flag: mark <html> keyboard vs pointer so the CSS shows the
            focus ring on form fields ONLY when reached by keyboard (Tab), never on
            click/tap. Buttons/links stay on :focus-visible (already keyboard-only).
            Runs before paint; listeners on document need no specific mount order. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var e=document.documentElement;document.addEventListener('keydown',function(v){if(v.key==='Tab')e.classList.add('keyboard-nav')},true);document.addEventListener('pointerdown',function(){e.classList.remove('keyboard-nav')},true)})()",
          }}
        />
        {children}
      </body>
    </html>
  );
}
