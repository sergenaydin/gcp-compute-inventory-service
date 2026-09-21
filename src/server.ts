import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import path from "node:path";
import { listAllInstances } from "./gcp/computeClient";
import { AppError } from "./errors";

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const PORT = Number(process.env.PORT ?? 8080);

if (!PROJECT_ID) {
  throw new Error(
    "GCP_PROJECT_ID environment variable is not set. Add a " +
      "GCP_PROJECT_ID=<project-id> line to your .env file (see README).",
  );
}

const app = express();
app.use(express.static(path.join(__dirname, "..", "public")));

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
