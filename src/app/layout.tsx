import "./globals.css";
import "@/components/erp/erp-kit.css";
import type { Viewport } from "next";
import {AppToastProvider} from "@/components/app-toast-provider";
import {AppDialogProvider} from "@/components/app-dialog-provider";
import {UiLanguageProvider} from "@/components/i18n";

export const metadata = {
  title: "ST Planning",
  description: "Surface Treatment Planning Master Data"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en" suppressHydrationWarning><body><UiLanguageProvider><AppDialogProvider>{children}<AppToastProvider/></AppDialogProvider></UiLanguageProvider></body></html>;
}
