import cors from "cors";
import express, { Request, Response } from "express";

import marketRoutes from "./routes/market.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req: Request, res: Response) => {

    res.status(200).json({
        success: true,
        application: "Crypto Arbitrage Scanner",
        version: "1.0.0",
        status: "Running"
    });

});

app.use("/api/markets", marketRoutes);

export default app;