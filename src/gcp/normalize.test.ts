import { describe, expect, it } from "vitest";
import type { protos } from "@google-cloud/compute";
import { normalizeGcpInstance } from "./normalize";

type GcpInstance = protos.google.cloud.compute.v1.IInstance;

const ZONE_URL =
  "https://www.googleapis.com/compute/v1/projects/opsitex-gcp-case-sergen/zones/europe-west1-b";
const MACHINE_TYPE_URL =
  "https://www.googleapis.com/compute/v1/projects/opsitex-gcp-case-sergen/zones/europe-west1-b/machineTypes/e2-micro";

function rawInstance(overrides: GcpInstance = {}): GcpInstance {
  return {
    id: "3709437074732791709",
    name: "envanter-test-1",
    status: "RUNNING",
    zone: ZONE_URL,
    machineType: MACHINE_TYPE_URL,
    creationTimestamp: "2026-09-21T03:39:48.133-07:00",
    networkInterfaces: [
      { networkIP: "10.132.0.3", accessConfigs: [{ natIP: "34.78.150.217" }] },
    ],
    labels: { env: "case" },
    ...overrides,
  };
}

describe("normalizeGcpInstance", () => {
  it("provider is always gcp", () => {
    expect(normalizeGcpInstance(rawInstance()).provider).toBe("gcp");
  });

  it("extracts the last segment from the zone URL", () => {
    expect(normalizeGcpInstance(rawInstance()).zone).toBe("europe-west1-b");
  });

  it("derives region from the zone name (part before the last dash)", () => {
    expect(normalizeGcpInstance(rawInstance()).region).toBe("europe-west1");
  });

  it("extracts the last segment from the machineType URL", () => {
    expect(normalizeGcpInstance(rawInstance()).machineType).toBe("e2-micro");
  });

  it("returns region equal to zone when the zone has no dash", () => {
    const result = normalizeGcpInstance(
      rawInstance({ zone: "https://.../zones/singlezone" }),
    );
    expect(result.zone).toBe("singlezone");
    expect(result.region).toBe("singlezone");
  });

  it("reads private and public IP from the first network interface", () => {
    const result = normalizeGcpInstance(rawInstance());
    expect(result.privateIp).toBe("10.132.0.3");
    expect(result.publicIp).toBe("34.78.150.217");
  });

  it("returns null publicIp when there's no access config", () => {
    const result = normalizeGcpInstance(
      rawInstance({
        networkInterfaces: [{ networkIP: "10.132.0.5", accessConfigs: [] }],
      }),
    );
    expect(result.privateIp).toBe("10.132.0.5");
    expect(result.publicIp).toBeNull();
  });

  it("returns null privateIp and publicIp when there's no network interface", () => {
    const result = normalizeGcpInstance(rawInstance({ networkInterfaces: [] }));
    expect(result.privateIp).toBeNull();
    expect(result.publicIp).toBeNull();
  });

  it.each([
    ["RUNNING", "running"],
    ["TERMINATED", "stopped"],
    ["STOPPING", "stopping"],
    ["SUSPENDING", "stopping"],
    ["SUSPENDED", "stopped"],
    ["PROVISIONING", "starting"],
    ["STAGING", "starting"],
    ["REPAIRING", "unknown"],
  ] as const)("maps GCP status %s -> common status %s", (gcpStatus, expected) => {
    expect(normalizeGcpInstance(rawInstance({ status: gcpStatus })).status).toBe(
      expected,
    );
  });

  it("falls back to unknown for an unrecognized or missing status", () => {
    expect(
      normalizeGcpInstance(rawInstance({ status: "SOME_NEW_GCP_STATE" })).status,
    ).toBe("unknown");
    expect(normalizeGcpInstance(rawInstance({ status: undefined })).status).toBe(
      "unknown",
    );
  });

  it("converts id to a string", () => {
    expect(normalizeGcpInstance(rawInstance({ id: "42" })).id).toBe("42");
  });

  it("returns an empty string when id is missing", () => {
    expect(normalizeGcpInstance(rawInstance({ id: undefined })).id).toBe("");
  });

  it("returns an empty string when name is missing", () => {
    expect(normalizeGcpInstance(rawInstance({ name: undefined })).name).toBe("");
  });

  it("returns an empty object when labels is missing, passes it through otherwise", () => {
    expect(normalizeGcpInstance(rawInstance({ labels: undefined })).labels).toEqual(
      {},
    );
    expect(
      normalizeGcpInstance(rawInstance({ labels: { team: "ops" } })).labels,
    ).toEqual({ team: "ops" });
  });

  it("returns null createdAt when creationTimestamp is missing", () => {
    expect(
      normalizeGcpInstance(rawInstance({ creationTimestamp: undefined })).createdAt,
    ).toBeNull();
  });
});
