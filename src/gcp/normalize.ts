import type { protos } from "@google-cloud/compute";
import { CloudInstance, InstanceStatus } from "../types";

type GcpInstance = protos.google.cloud.compute.v1.IInstance;

const STATUS_MAP: Record<string, InstanceStatus> = {
  RUNNING: "running",
  TERMINATED: "stopped",
  STOPPING: "stopping",
  SUSPENDING: "stopping",
  SUSPENDED: "stopped",
  PROVISIONING: "starting",
  STAGING: "starting",
  REPAIRING: "unknown",
};

/** Returns the last path segment of a resource URL (e.g. the zone/machineType name). */
function lastUrlSegment(url: string | null | undefined): string {
  if (!url) return "";
  const parts = url.split("/");
  return parts[parts.length - 1] ?? "";
}

function zoneToRegion(zone: string): string {
  // us-central1-a -> us-central1
  const lastDash = zone.lastIndexOf("-");
  return lastDash === -1 ? zone : zone.slice(0, lastDash);
}

export function normalizeGcpInstance(raw: GcpInstance): CloudInstance {
  const zone = lastUrlSegment(raw.zone);
  const networkInterface = raw.networkInterfaces?.[0];
  const publicIp = networkInterface?.accessConfigs?.[0]?.natIP ?? null;

  return {
    provider: "gcp",
    id: String(raw.id ?? ""),
    name: raw.name ?? "",
    status: STATUS_MAP[raw.status ?? ""] ?? "unknown",
    region: zoneToRegion(zone),
    zone,
    machineType: lastUrlSegment(raw.machineType),
    privateIp: networkInterface?.networkIP ?? null,
    publicIp,
    createdAt: raw.creationTimestamp ?? null,
    labels: raw.labels ?? {},
  };
}
