export type ExternalVendor = "NDPS" | "JININFRA";

export type MappingResult = {
  vendorDeviceId: string;
  assetId: string | null;
  mapped: boolean;
  assetExists: boolean;
  mappingStatus: "ACTIVE" | "PENDING" | "SUSPENDED" | "UNMAPPED" | "CONFLICT";
};

export type InvokeRequest = {
  payloadType?: string;
  context: { eventExternalId: string; sourceSystem: string; occurredAt: string; sourceDeviceId: string; reportedByDeviceId?: string; [key: string]: unknown };
  relatedDeviceIds?: string[];
  activePath: Array<{ sequence: number; fromDeviceId: string; toDeviceId: string; medium: string; evidenceType: string; observations: Array<Record<string, unknown>>; [key: string]: unknown }>;
  data: Record<string, unknown>;
  [key: string]: unknown;
};

const deviceIdKeys = new Set(["vendorDeviceId", "reportedByDeviceId", "sourceDeviceId", "fromDeviceId", "toDeviceId", "gatewayDeviceId", "baseDeviceId", "cpeDeviceId", "terminalDeviceId", "baseStationDeviceId"]);
const deviceIdArrayKeys = new Set(["relatedDeviceIds", "receivedTerminalDeviceIds"]);

export function collectDeviceIds(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) collectDeviceIds(item, output);
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
    if (deviceIdKeys.has(key) && typeof item === "string" && item) output.add(item);
    else if (deviceIdArrayKeys.has(key) && Array.isArray(item)) item.forEach((id) => typeof id === "string" && id && output.add(id));
    else collectDeviceIds(item, output);
  }
  return output;
}
