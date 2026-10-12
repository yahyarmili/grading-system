import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { RoleSwitcher } from "@/components/dev/role-switcher";
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

const isDev = process.env.NODE_ENV === "development";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        {/* TEMPORARY: removed in E1. */}
        {isDev && (
          <Suspense>
            <RoleSwitcher />
          </Suspense>
        )}
        {children}
      </body>
    </html>
  );
}
