import type { Metadata } from "next";
import Link from "next/link";
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
      <body>
        <nav className="border-b border-gray-200 bg-white/85 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
            <Link href="/" className="text-sm font-semibold uppercase tracking-wide text-gray-950">
              Personal Execution Tracker
            </Link>
            <div className="flex items-center gap-2 rounded-full bg-gray-100 p-1 text-sm font-medium text-gray-600">
              <Link href="/" className="rounded-full px-4 py-2 transition hover:bg-white hover:text-gray-950 hover:shadow-sm">
                Dashboard
              </Link>
              <Link href="/timeline" className="rounded-full px-4 py-2 transition hover:bg-white hover:text-gray-950 hover:shadow-sm">
                Timeline
              </Link>
              <Link href="/pomodoro" className="rounded-full px-4 py-2 transition hover:bg-white hover:text-gray-950 hover:shadow-sm">
                Pomodoro
              </Link>
              <Link href="/library" className="rounded-full px-4 py-2 transition hover:bg-white hover:text-gray-950 hover:shadow-sm">
                Library
              </Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
