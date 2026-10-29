import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "黑帝｜本機遊戲自動化",
  description: "黑帝 BlackLord 的本機自動化、模組分析與遊戲畫面判讀工作區",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
