import { useEffect, useState } from "react";

import AppRouter, {
  type AppPage,
} from "@/app/AppRouter";
import MainLayout from "@/layouts/MainLayout";

import {
  startSocketManager,
  stopSocketManager,
} from "@/socket/socketManager";

function App() {
  const [page, setPage] = useState<AppPage>("dashboard");

  useEffect(() => {
    startSocketManager();

    return () => {
      stopSocketManager();
    };
  }, []);

  return (
    <MainLayout
      currentPage={page}
      onPageChange={setPage}
    >
      <AppRouter page={page} />
    </MainLayout>
  );
}

export default App;