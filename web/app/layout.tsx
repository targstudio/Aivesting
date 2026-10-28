import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AI.vesting",
  description: "Análise de mercado com IA: ranking de ativos, macro e explicações em tempo real.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <Header />
        <div className="mx-auto flex max-w-[1600px]">
          <Sidebar />
          <main className="min-w-0 flex-1 px-4 pb-24 pt-6 md:px-10 md:pb-12 md:pt-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
