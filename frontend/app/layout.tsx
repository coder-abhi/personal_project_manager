import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Execution Tracker",
  description: "Track planned and actual execution time across projects.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
