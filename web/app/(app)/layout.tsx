import { AppProvider } from "@/app/components/AppProvider";
import { AskAI } from "@/app/components/AskAI";
import { Header } from "@/app/components/Header";
import { Sidebar } from "@/app/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <Header />
      <div className="mx-auto flex max-w-[1600px]">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 md:px-10 md:pb-12 md:pt-8">{children}</main>
      </div>
      <AskAI />
    </AppProvider>
  );
}
