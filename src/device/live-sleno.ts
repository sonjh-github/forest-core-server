import type {
  ExternalVendor,
  InvokeRequest,
  MappingResult,
} from "../types.js";

import type {
  VendorIntegrationMessageRow,
} from "../db/vendor-messages.js";

const latestRows =
  new Map<
    string,
    VendorIntegrationMessageRow
  >();

function resolveDeviceId(
  deviceId: string,
  mappings: MappingResult[],
): string {
  const mapping =
    mappings.find(
      (item) =>
        item.vendorDeviceId === deviceId &&
        item.mapped &&
        item.assetId,
    );

  return mapping?.assetId ?? deviceId;
}

function normalizeForLiveCache(
  request: InvokeRequest,
  mappings: MappingResult[],
): InvokeRequest {
  return {
    ...request,

    context: {
      ...request.context,

      sourceDeviceId:
        resolveDeviceId(
          request.context.sourceDeviceId,
          mappings,
        ),
    },

    relatedDeviceIds:
      request.relatedDeviceIds?.map(
        (deviceId) =>
          resolveDeviceId(
            deviceId,
            mappings,
          ),
      ),

    activePath:
      request.activePath.map(
        (hop) => ({
          ...hop,

          fromDeviceId:
            resolveDeviceId(
              hop.fromDeviceId,
              mappings,
            ),

          toDeviceId:
            resolveDeviceId(
              hop.toDeviceId,
              mappings,
            ),
        }),
      ),
  };
}

export function rememberLiveSleno(
  vendor: ExternalVendor,
  request: InvokeRequest,
  mappings: MappingResult[],
) {
  if (
    vendor !== "JININFRA" ||
    request.payloadType !== "RTK_POSITION" ||
    request.context.sourceSystem !==
      "sleno-server"
  ) {
    return;
  }

  const normalized =
    normalizeForLiveCache(
      request,
      mappings,
    );

  const sourceDeviceId =
    normalized.context
      .sourceDeviceId
      .trim();

  if (!sourceDeviceId) {
    return;
  }

  const occurredAt =
    normalized.context.occurredAt;

  latestRows.set(
    sourceDeviceId,
    {
      request_id:
        `live:${normalized.context.eventExternalId}:${occurredAt}:${sourceDeviceId}`,

      event_external_id:
        normalized.context
          .eventExternalId || null,

      payload_type:
        "RTK_POSITION",

      source_device_id:
        sourceDeviceId,

      occurred_at:
        occurredAt,

      received_at: new Date().toISOString(),

      /*
       * 실제 수신 패킷이지만
       * DB 저장 성공 여부와는 분리한다.
       */
      status:
        "LIVE_UNPERSISTED",

      payload:
        normalized as unknown as
          Record<string, unknown>,
    },
  );
}

export function readLiveSlenoRows():
  VendorIntegrationMessageRow[] {
  return [
    ...latestRows.values(),
  ].sort(
    (a, b) =>
      Date.parse(b.occurred_at) -
      Date.parse(a.occurred_at),
  );
}

export function clearLiveSlenoRows() {
  latestRows.clear();
}
