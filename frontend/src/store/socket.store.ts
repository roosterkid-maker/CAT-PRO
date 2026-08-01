import { create } from "zustand";

export type SocketStatus =
  | "connecting"
  | "connected"
  | "disconnected";

interface SocketState {
  status: SocketStatus;
  setStatus: (status: SocketStatus) => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  status: "connecting",

  setStatus: (status) => set({ status }),
}));