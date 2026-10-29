import { AccountSync } from "@/app/components/AccountSync";
import { ApiStatusProvider } from "@/app/components/ApiStatus";
import { AppProvider } from "@/app/components/AppProvider";
import { AskAI } from "@/app/components/AskAI";
import { Header } from "@/app/components/Header";
import { AreaTabs, Sidebar } from "@/app/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ApiStatusProvider>
      <AppProvider>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="min-w-0 flex-1">
            <Header />
            <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-4 md:px-8 md:pb-12 md:pt-2">
              <AreaTabs />
              {children}
            </main>
          </div>
        </div>
        <AskAI />
        <AccountSync />
      </AppProvider>
    </ApiStatusProvider>
  );
}
