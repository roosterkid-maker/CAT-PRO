import type { ReactNode } from "react";

import type { AppPage } from "@/app/AppRouter";

import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import StatusBar from "../components/layout/StatusBar";

interface MainLayoutProps {
  children: ReactNode;
  currentPage: AppPage;
  onPageChange: (page: AppPage) => void;
}

export default function MainLayout({
  children,
  currentPage,
  onPageChange,
}: MainLayoutProps) {
  return (
    <div className="cat-pro-shell flex h-screen flex-col bg-app-bg">
      <Header
        onPageChange={onPageChange}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          currentPage={currentPage}
          onPageChange={onPageChange}
        />

        <main className="cat-pro-main min-w-0 flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
