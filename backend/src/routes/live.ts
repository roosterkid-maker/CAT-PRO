import { Router } from "express";
import { marketCache } from "../services/cache.service";

const router = Router();

router.get("/", (_, res) => {
  res.json({
    success: true,
    count: marketCache.size(),
    data: marketCache.getAll(),
  });
});

export default router;