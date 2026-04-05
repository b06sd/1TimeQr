import "dotenv/config";

import express from "express";

import cors from "cors";

import helmet from "helmet";

import morgan from "morgan";

import rateLimit from "express-rate-limit";

import { connectDB } from "./models/database";

import scanRoutes, { getScanPage } from "./routes/ticketRoutes";

const app = express();

const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],

        styleSrc: ["'self'", "'unsafe-inline'"],

        scriptSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  }),
);

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));

app.use(express.json());

app.use(morgan("dev"));
app.use(express.static("public"));

const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,

  max: 20,

  standardHeaders: true,

  legacyHeaders: false,

  message: { granted: false, error: "Too many requests. Please wait." },
});

app.get("/scan", getScanPage);

app.use("/api/scan", verifyLimiter, scanRoutes);

app.use("/api/admin", scanRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Not found" });
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Wedding QR server running on http://localhost:${PORT}`);

    console.log(`   Scan page: http://localhost:${PORT}/scan`);
  });
});
