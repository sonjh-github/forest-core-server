import { findAssetTypeId, findRegisteredAsset, insertAssetWithVendorMapping, listEnabledAssetTypes, listRegisteredAssets, upsertVendorDeviceMapping } from "../db/asset-registry.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VENDORS = new Set(["NDPS", "JININFRA"]);
const MAPPING_STATUSES = new Set(["ACTIVE", "PENDING", "SUSPENDED"]);

export class RegistryError extends Error {
  constructor(public code: string, message: string, public status: 400 | 404 | 409 = 400) {
    super(message);
  }
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new RegistryError("INVALID_REQUEST", `${field}는 문자열이어야 합니다.`);
  return value.trim() || null;
}

export function parseAssetId(value: string): string {
  const assetId = value.trim();
  if (!UUID_PATTERN.test(assetId)) throw new RegistryError("INVALID_REQUEST", "assetId는 UUID 형식이어야 합니다.");
  return assetId;
}

export async function readAssetTypes() {
  return listEnabledAssetTypes();
}

export async function registerAsset(body: Record<string, unknown>) {
  const assetCode = optionalText(body.assetCode, "assetCode");
  const assetTypeId = optionalText(body.assetTypeId, "assetTypeId");
  const vendor = optionalText(body.vendor, "vendor")?.toUpperCase();
  const vendorDeviceId = optionalText(body.vendorDeviceId, "vendorDeviceId");
  const deviceType = optionalText(body.deviceType, "deviceType");
  const mappingStatus = (optionalText(body.mappingStatus, "mappingStatus") ?? "ACTIVE").toUpperCase();
  if (!assetCode) throw new RegistryError("INVALID_REQUEST", "assetCode는 필수입니다.");
  if (!assetTypeId) throw new RegistryError("INVALID_REQUEST", "assetTypeId는 필수입니다.");
  if (!UUID_PATTERN.test(assetTypeId)) throw new RegistryError("INVALID_REQUEST", "assetTypeId는 UUID 형식이어야 합니다.");
  if (!vendor || !VENDORS.has(vendor)) throw new RegistryError("INVALID_VENDOR", "vendor는 NDPS 또는 JININFRA여야 합니다.");
  if (!vendorDeviceId || !deviceType) throw new RegistryError("INVALID_REQUEST", "vendorDeviceId와 deviceType은 필수입니다.");
  if (!MAPPING_STATUSES.has(mappingStatus)) throw new RegistryError("INVALID_REQUEST", "매핑 상태가 올바르지 않습니다.");
  if (body.specifications !== undefined && (body.specifications === null || Array.isArray(body.specifications) || typeof body.specifications !== "object")) {
    throw new RegistryError("INVALID_REQUEST", "specifications는 JSON 객체여야 합니다.");
  }
  const resolvedAssetTypeId = await findAssetTypeId(assetTypeId);
  if (!resolvedAssetTypeId) throw new RegistryError("ASSET_TYPE_NOT_FOUND", "활성화된 장비 유형을 찾을 수 없습니다.", 404);
  try {
    return await insertAssetWithVendorMapping({
      asset_type_id: resolvedAssetTypeId,
      asset_code: assetCode,
      asset_name: optionalText(body.assetName, "assetName"),
      status: optionalText(body.status, "status") ?? "READY",
      product_name: optionalText(body.productName, "productName"),
      model_name: optionalText(body.modelName, "modelName"),
      specifications: (body.specifications as Record<string, unknown> | undefined) ?? {},
    }, {
      vendor_code: vendor,
      vendor_device_id: vendorDeviceId,
      device_type: deviceType,
      status: mappingStatus as "ACTIVE" | "PENDING" | "SUSPENDED",
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      const message = "message" in error ? String(error.message) : "";
      if (message.includes("vendor_device_mapping_pkey")) {
        throw new RegistryError("VENDOR_DEVICE_CONFLICT", "이미 연결된 업체 장비 ID입니다.", 409);
      }
      throw new RegistryError("ASSET_CODE_CONFLICT", "이미 등록된 assetCode입니다.", 409);
    }
    throw error;
  }
}

export async function readAsset(assetId: string) {
  return findRegisteredAsset(parseAssetId(assetId));
}

export async function readAssets(limitValue?: string) {
  const parsed = limitValue === undefined ? 100 : Number(limitValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
    throw new RegistryError("INVALID_REQUEST", "limit은 1~200 사이의 정수여야 합니다.");
  }
  return listRegisteredAssets(parsed);
}

export async function registerVendorMapping(assetIdValue: string, body: Record<string, unknown>) {
  const assetId = parseAssetId(assetIdValue);
  if (!await findRegisteredAsset(assetId)) throw new RegistryError("ASSET_NOT_FOUND", "물리 장비를 찾을 수 없습니다.", 404);
  const vendor = optionalText(body.vendor, "vendor")?.toUpperCase();
  const vendorDeviceId = optionalText(body.vendorDeviceId, "vendorDeviceId");
  const deviceType = optionalText(body.deviceType, "deviceType");
  const status = (optionalText(body.status, "status") ?? "ACTIVE").toUpperCase();
  if (!vendor || !VENDORS.has(vendor)) throw new RegistryError("INVALID_VENDOR", "vendor는 NDPS 또는 JININFRA여야 합니다.");
  if (!vendorDeviceId || !deviceType) throw new RegistryError("INVALID_REQUEST", "vendorDeviceId와 deviceType은 필수입니다.");
  if (!MAPPING_STATUSES.has(status)) throw new RegistryError("INVALID_REQUEST", "매핑 상태가 올바르지 않습니다.");
  return upsertVendorDeviceMapping({
    vendor_code: vendor,
    vendor_device_id: vendorDeviceId,
    asset_id: assetId,
    device_type: deviceType,
    status: status as "ACTIVE" | "PENDING" | "SUSPENDED",
    last_seen_at: new Date().toISOString(),
    metadata: { mappingSource: "DASHBOARD" },
  });
}
