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
    // autoPaginate:false silences a warning; the async iterator already
    // handles paging page by page on its own (see the gax-nodejs auto-pagination note).
    const iterable = instancesClient.aggregatedListAsync(
      { project: projectId },
      { autoPaginate: false },
    );

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

/**
 * Looks up a single instance by its numeric GCP instance ID. GCP's `get`
 * API needs the zone up front, which the caller doesn't have, so this
 * reuses the same aggregatedList call as listAllInstances and filters
 * client-side — fine at this project's scale, not meant for large fleets.
 */
export async function getInstanceById(
  projectId: string,
  id: string,
): Promise<CloudInstance | null> {
  const { instances } = await listAllInstances(projectId);
  return instances.find((instance) => instance.id === id) ?? null;
}
