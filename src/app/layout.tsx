import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a1628",
};

export const metadata: Metadata = {
  title: "BreathEasy SG",
  description: "Hyperlocal air quality for Singapore runners",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🫁</text></svg>"
        />
      </head>
      <body className="bg-[#0a1628] text-[#e0e8f0] antialiased">
        {children}
      </body>
    </html>
  );
}
