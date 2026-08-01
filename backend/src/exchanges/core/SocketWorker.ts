import WebSocket from "ws";

export interface SocketWorkerConfig {
  name: string;

  url: string;

  reconnectDelay: number;

  onOpen?: (worker: SocketWorker) => void;

  onMessage?: (
    worker: SocketWorker,
    message: string,
  ) => void;

  onClose?: (
    worker: SocketWorker,
    code: number,
    reason: string,
  ) => void;

  onError?: (
    worker: SocketWorker,
    error: Error,
  ) => void;
}

export class SocketWorker {
  private socket: WebSocket | null = null;

  private connected = false;

  private reconnectTimer: NodeJS.Timeout | null =
    null;

  private manuallyClosed = false;

  constructor(
    private readonly config: SocketWorkerConfig,
  ) {}

  connect(): void {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState ===
        WebSocket.CONNECTING
    ) {
      return;
    }

    this.manuallyClosed = false;

    this.socket = new WebSocket(
      this.config.url,
    );

    this.socket.on("open", () => {
      this.connected = true;

      console.log(
        `[${this.config.name}] Connected`,
      );

      this.config.onOpen?.(this);
    });

    this.socket.on(
      "message",
      (rawData) => {
        this.config.onMessage?.(
          this,
          rawData.toString(),
        );
      },
    );

    this.socket.on(
      "close",
      (code, reason) => {
        this.connected = false;

        console.log(
          `[${this.config.name}] Closed: ${code}`,
        );

        this.config.onClose?.(
          this,
          code,
          reason.toString(),
        );

        if (!this.manuallyClosed) {
          this.scheduleReconnect();
        }
      },
    );

    this.socket.on("error", (error) => {
      this.config.onError?.(
        this,
        error,
      );
    });
  }

  disconnect(): void {
    this.manuallyClosed = true;

    this.connected = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);

      this.reconnectTimer = null;
    }

    this.socket?.close();

    this.socket = null;
  }

  send(data: unknown): void {
    if (
      !this.socket ||
      this.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    this.socket.send(
      JSON.stringify(data),
    );
  }

  isConnected(): boolean {
    return this.connected;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      this.connect();
    }, this.config.reconnectDelay);
  }
}