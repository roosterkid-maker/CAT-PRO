"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSocket = initializeSocket;
exports.getIO = getIO;
const socket_io_1 = require("socket.io");
let io;
function initializeSocket(httpServer) {
    io = new socket_io_1.Server(httpServer, {
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
function getIO() {
    return io;
}
//# sourceMappingURL=server.js.map