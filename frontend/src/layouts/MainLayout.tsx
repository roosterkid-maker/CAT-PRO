import type { ReactNode } from "react";

import type { AppPage } from "@/app/AppRouter";

import DeploymentWatcher from "../components/layout/DeploymentWatcher";
import Header from "../components/layout/Header";
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
    <div className="cat-pro-shell crt-warp flex h-screen flex-col">
      <div aria-hidden="true" className="term-noise" />
      <div aria-hidden="true" className="term-scanlines" />

      <Header
        currentPage={currentPage}
        onPageChange={onPageChange}
      />

      <main className="cat-pro-main min-h-0 min-w-0 flex-1 overflow-auto">
        <div className="term-page">
          {children}
        </div>
      </main>

      <StatusBar />

      <DeploymentWatcher />
    </div>
  );
}
