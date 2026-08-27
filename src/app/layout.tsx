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
  title: {
    default: "Waxxor",
    template: "%s · Waxxor",
  },
  description: "Watson — Operations OS for technology service companies",
  // capable: true is what makes "Add to Home Screen" launch standalone
  // (no Safari chrome) instead of opening the shortcut in the browser.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Watson",
  },
  other: {
    // Next only emits the unprefixed "mobile-web-app-capable" from
    // appleWebApp.capable — iOS Safari still requires this legacy,
    // apple-prefixed one for the standalone-launch behavior above.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7c3aed",
};

// Applies the saved theme before first paint to avoid a flash of the wrong theme.
const themeInit = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
