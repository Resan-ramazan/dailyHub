import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import { NavLinks, NextRun, ThemeToggle } from "@/components/client";
import { readSchedule } from "@/lib/jobs";
import { readNewsSchedule } from "@/lib/news";
import "./globals.css";

const inter = Inter_Tight({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });

export const metadata: Metadata = { title: "Daily Hub", description: "Personal dashboard: jobs, AI news, todos and routine" };
export const dynamic = "force-dynamic";

// Runs before first paint: saved choice wins, otherwise follow the system setting.
const themeScript = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [jobs, news] = await Promise.all([readSchedule(), readNewsSchedule()]);
  const runs = [
    { label: "Job scan", hour: jobs.hour, minute: jobs.minute },
    ...(news.installed ? [{ label: "AI brief", hour: news.hour, minute: news.minute }] : []),
  ];
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="aurora" aria-hidden><i /><i /><i /></div>
        <header className="top">
          <div className="top-inner">
            <a href="/" className="wordmark"><i />Daily Hub</a>
            <NavLinks />
            <div className="top-right">
              <NextRun runs={runs} />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="content">{children}</main>
      </body>
    </html>
  );
}
