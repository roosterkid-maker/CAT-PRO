import { Server } from "socket.io";

let io: Server;

export function initializeSocket(httpServer: any): Server {

    io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {

        console.log("[Frontend] Connected:", socket.id);

        socket.on("disconnect", () => {
            console.log("[Frontend] Disconnected:", socket.id);
        });

    });

    return io;

}

export function getIO(): Server {
    return io;
}