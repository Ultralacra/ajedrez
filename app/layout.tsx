import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Enroque — ajedrez en vivo",
    template: "%s · Enroque",
  },
  description: "Juega ajedrez en vivo con otra persona y háblense por el micrófono. Sin cuentas.",
  openGraph: {
    title: "Enroque — ajedrez en vivo",
    description: "Una sala, un tablero y la voz abierta. Para dos.",
    locale: "es",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#14160f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
