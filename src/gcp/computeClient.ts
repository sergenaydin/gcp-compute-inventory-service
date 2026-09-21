import { InstancesClient } from "@google-cloud/compute";
import { toAppError } from "../errors";
import { CloudInstance, ListInstancesResult } from "../types";
import { normalizeGcpInstance } from "./normalize";

/**
 * Reads the service account key via the GOOGLE_APPLICATION_CREDENTIALS
 * environment variable (Application Default Credentials). Never connects
 * with a user account (gcloud auth login) — see the README's "Identity" section.
 */
const instancesClient = new InstancesClient();

/**
 * Collects VMs across all zones in the project in a single call and
 * normalizes them into the common shape. Uses aggregatedList instead of
 * iterating zones one by one; empty zones (with no `instances` field) are skipped.
 */
export async function listAllInstances(
  projectId: string,
): Promise<ListInstancesResult> {
  const instances: CloudInstance[] = [];

  try {
    const iterable = instancesClient.aggregatedListAsync({ project: projectId });

    for await (const [, scopedList] of iterable) {
      for (const raw of scopedList.instances ?? []) {
        instances.push(normalizeGcpInstance(raw));
      }
    }
  } catch (err) {
    throw toAppError(err, projectId);
  }

  return { instances, count: instances.length, projectId };
}
