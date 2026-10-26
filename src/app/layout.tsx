import type { Metadata, Viewport } from "next";
import { DemoNotice } from "@/components/demo-notice";
import { isProductionDeployment } from "@/lib/deployment";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Grading system", template: "%s · Grading system" },
  description: "Assessment of student writing in English and French.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        {/* VERCEL_ENV is fixed per deployment: read at build time, the shell stays static. */}
        {isProductionDeployment(process.env) && <DemoNotice />}
        {children}
      </body>
    </html>
  );
}
