import { io, type Socket } from "socket.io-client";

import {
  SOCKET_URL,
} from "../config/runtimeUrls";

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      autoConnect: false,
    });
  }

  if (!socket.connected) {
    socket.connect();
  }

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
