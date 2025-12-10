import { ReactNode } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [location] = useLocation();
  const isDeviceDetailPage = /^\/devices\/\d+$/.test(location);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {!isDeviceDetailPage && <Header />}
        <main className={`flex-1 overflow-auto ${isDeviceDetailPage ? 'pt-4 px-6' : 'p-6'}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
