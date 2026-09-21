import { describe, expect, it } from "vitest";
import { AppError, toAppError } from "./errors";

describe("AppError", () => {
  it("defaults to statusCode 500 when not specified", () => {
    const err = new AppError("something went wrong");
    expect(err.statusCode).toBe(500);
    expect(err.userMessage).toBe("something went wrong");
    expect(err.message).toBe("something went wrong");
    expect(err.name).toBe("AppError");
    expect(err).toBeInstanceOf(Error);
  });

  it("does not set cause when not provided", () => {
    const err = new AppError("message");
    expect(err.cause).toBeUndefined();
  });

  it("carries cause through unchanged when provided", () => {
    const original = new Error("raw error");
    const err = new AppError("message", 404, original);
    expect(err.statusCode).toBe(404);
    expect(err.cause).toBe(original);
  });
});

describe("toAppError", () => {
  it("gRPC 16 (UNAUTHENTICATED) -> 401, credential message", () => {
    const raw = { code: 16, message: "unauthenticated" };
    const result = toAppError(raw, "opsitex-gcp-case-sergen");
    expect(result.statusCode).toBe(401);
    expect(result.userMessage).toMatch(/gcp authentication failed/i);
    expect(result.cause).toBe(raw);
  });

  it("gRPC 7 (PERMISSION_DENIED) -> 403, embeds project ID and role in the message", () => {
    const raw = { code: 7, message: "permission denied" };
    const result = toAppError(raw, "opsitex-gcp-case-sergen");
    expect(result.statusCode).toBe(403);
    expect(result.userMessage).toContain("opsitex-gcp-case-sergen");
    expect(result.userMessage).toContain("roles/compute.viewer");
  });

  it("gRPC 5 (NOT_FOUND) -> 404, embeds project ID in the message", () => {
    const raw = { code: 5, message: "not found" };
    const result = toAppError(raw, "this-project-does-not-exist-xyz");
    expect(result.statusCode).toBe(404);
    expect(result.userMessage).toContain("this-project-does-not-exist-xyz");
  });

  it("gRPC 8 (RESOURCE_EXHAUSTED) -> 429, quota message", () => {
    const raw = { code: 8, message: "quota exceeded" };
    const result = toAppError(raw, "project");
    expect(result.statusCode).toBe(429);
    expect(result.userMessage).toMatch(/quota exceeded/i);
  });

  it.each(["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"])(
    "network error containing %s -> 503",
    (code) => {
      const raw = new Error(`connect ${code} 127.0.0.1:443`);
      const result = toAppError(raw, "project");
      expect(result.statusCode).toBe(503);
      expect(result.userMessage).toMatch(/could not reach the gcp api/i);
    },
  );

  it("catches missing ADC message -> 401", () => {
    const raw = new Error(
      "Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started",
    );
    const result = toAppError(raw, "project");
    expect(result.statusCode).toBe(401);
    expect(result.userMessage).toMatch(/no gcp service account credentials found/i);
  });

  it("returns a generic 502 for anything unmatched, includes the original message", () => {
    const raw = new Error("Something totally unexpected happened");
    const result = toAppError(raw, "project");
    expect(result.statusCode).toBe(502);
    expect(result.userMessage).toContain("Something totally unexpected happened");
  });

  it("handles a non-Error thrown value (string throw) gracefully", () => {
    const result = toAppError("boom", "project");
    expect(result.statusCode).toBe(502);
    expect(result.userMessage).toContain("boom");
  });

  it("gRPC code takes priority even if the message matches the network regex", () => {
    const raw = { code: 5, message: "ECONNREFUSED but actually NOT_FOUND" };
    const result = toAppError(raw, "project");
    expect(result.statusCode).toBe(404);
  });

  it("carries the original error as cause on every branch", () => {
    const raw = new Error("Something totally unexpected happened");
    const result = toAppError(raw, "project");
    expect(result.cause).toBe(raw);
  });
});
