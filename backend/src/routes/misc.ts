import { Router } from "express";

export const miscRouter = Router();

miscRouter.get("/time", (_req, res) => {
  res.json({ serverTime: new Date().toISOString() });
});
