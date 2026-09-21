export type InstanceStatus =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "terminated"
  | "unknown";

/**
 * Provider-agnostic inventory record used across the product.
 * AWS and GCP clients map their different SDK shapes onto this type.
 */
export interface CloudInstance {
  provider: "gcp" | "aws";
  id: string;
  name: string;
  status: InstanceStatus;
  region: string;
  zone: string;
  machineType: string;
  privateIp: string | null;
  publicIp: string | null;
  createdAt: string | null;
  labels: Record<string, string>;
}

export interface ListInstancesResult {
  instances: CloudInstance[];
  count: number;
  projectId: string;
}
