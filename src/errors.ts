/**
 * An error message clear enough for the user to diagnose the problem
 * themselves. `cause` carries the technical detail (logged, never sent to the client).
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly userMessage: string;

  constructor(userMessage: string, statusCode = 500, cause?: unknown) {
    super(userMessage);
    this.name = "AppError";
    this.userMessage = userMessage;
    this.statusCode = statusCode;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * Converts a raw error from @google-cloud/compute calls into an actionable
 * AppError, based on gRPC status codes and known network errors.
 * Reference: https://cloud.google.com/apis/design/errors
 */
export function toAppError(err: unknown, projectId: string): AppError {
  const grpcCode = (err as { code?: number })?.code;
  const message = err instanceof Error ? err.message : String(err);

  switch (grpcCode) {
    case 16: // UNAUTHENTICATED
      return new AppError(
        `GCP authentication failed. Make sure GOOGLE_APPLICATION_CREDENTIALS ` +
          `points to a valid service account key file and that the key ` +
          `hasn't been revoked.`,
        401,
        err,
      );
    case 7: // PERMISSION_DENIED
      return new AppError(
        `The service account doesn't appear to have compute.instances.list ` +
          `permission on project "${projectId}". Grant the service account at ` +
          `least the "Compute Viewer" (roles/compute.viewer) role in IAM.`,
        403,
        err,
      );
    case 5: // NOT_FOUND
      return new AppError(
        `Project "${projectId}" was not found, or the Compute Engine API ` +
          `isn't enabled on it. Check the project ID and run ` +
          `"gcloud services enable compute.googleapis.com".`,
        404,
        err,
      );
    case 8: // RESOURCE_EXHAUSTED
      return new AppError(
        `GCP API quota exceeded. Wait a few minutes and try again, or check ` +
          `your quotas under Cloud Console > IAM & Admin > Quotas.`,
        429,
        err,
      );
    default:
      break;
  }

  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/.test(message)) {
    return new AppError(
      `Could not reach the GCP API over the network (${message}). Check your ` +
        `internet connection and proxy/firewall settings.`,
      503,
      err,
    );
  }

  if (/Could not load the default credentials/i.test(message)) {
    return new AppError(
      `No GCP service account credentials found. Set the ` +
        `GOOGLE_APPLICATION_CREDENTIALS environment variable to the full path ` +
        `of a service account key file.`,
      401,
      err,
    );
  }

  return new AppError(
    `Failed to fetch inventory from GCP Compute Engine: ${message}`,
    502,
    err,
  );
}
