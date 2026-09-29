import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Story Simulator",
  description: "An AI-powered interactive story simulation prototype"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
