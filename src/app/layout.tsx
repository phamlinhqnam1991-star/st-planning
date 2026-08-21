import "./globals.css";
import type { Viewport } from "next";

export const metadata = {
  title: "ST Planning",
  description: "Surface Treatment Planning Master Data"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="vi"><body>{children}</body></html>;
}
