import "dotenv/config";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { getInstanceById, listAllInstances } from "./gcp/computeClient";
import { AppError } from "./errors";

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const PORT = Number(process.env.PORT ?? 8080);

if (!PROJECT_ID) {
  throw new Error(
    "GCP_PROJECT_ID environment variable is not set. Add a " +
      "GCP_PROJECT_ID=<project-id> line to your .env file (see README).",
  );
}

// Only needed when a UI is hosted on another origin (a static host, for example);
// the UI's dev server uses a proxy instead. Comma-separated, e.g. https://ui.example.com
const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();

if (allowedOrigins.length > 0) {
  app.use("/api", cors({ origin: allowedOrigins, methods: ["GET"] }));
}

app.get("/", (_req, res) => {
  res.json({
    service: "gcp-compute-inventory-service",
    endpoints: ["GET /api/health", "GET /api/instances", "GET /api/instances/:id"],
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get(
  "/api/instances",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await listAllInstances(PROJECT_ID);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  "/api/instances/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instance = await getInstanceById(PROJECT_ID, req.params.id);
      if (!instance) {
        res.status(404).json({ error: `No instance found with id "${req.params.id}".` });
        return;
      }
      res.json(instance);
    } catch (err) {
      next(err);
    }
  },
);

// Central error handler: every error lands here normalized into an
// AppError, and a readable message + appropriate HTTP status is returned.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const appError =
    err instanceof AppError
      ? err
      : new AppError(
          err instanceof Error ? err.message : "An unexpected error occurred.",
          500,
          err,
        );

  if (appError.cause) {
    console.error(appError.cause);
  }

  res.status(appError.statusCode).json({ error: appError.userMessage });
});

app.listen(PORT, () => {
  console.log(`GCP Compute Inventory Service listening on http://localhost:${PORT}`);
});
