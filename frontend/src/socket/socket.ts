import { io, type Socket } from "socket.io-client";

const socketUrl =
  import.meta.env.VITE_SOCKET_URL ?? "http://localhost:5000";

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (!socket) {
    socket = io(socketUrl, {
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