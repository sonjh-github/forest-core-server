# 장비 관련 로그 조회 API

특정 물리 장비 UUID와 관련된 장비 연동 메시지를 최신순으로 조회한다. 대시보드에서 장비 상세 화면을 열거나 로그 영역을 펼칠 때 호출하며, 전체 로그를 한꺼번에 불러오지 않고 `cursor`를 이용해 다음 페이지를 조회한다.

Core DB에는 `mode=DELIVER`로 수신되어 실제 처리된 메시지만 저장하므로 이 API의 로그도 `DELIVER`만 반환한다. `VALIDATE_ONLY` 요청은 Vendor 서버의 Google Sheet 요청 로그에서 확인하며 이 API에는 나타나지 않는다.

## API

```http
GET /api/v1/dashboard/assets/{assetId}/logs?limit=20&cursor={nextCursor}
```

운영 주소 예시는 다음과 같다.

```http
GET https://api.forest.tobeunicorn.kr/api/v1/dashboard/assets/20000000-0000-4000-8000-000000000002/logs?limit=20
```

### Path parameter

| 이름 | 필수 | 설명 |
|---|---:|---|
| `assetId` | O | Core에서 발급한 물리 장비 UUID |

### Query parameter

| 이름 | 필수 | 기본값 | 설명 |
|---|---:|---:|---|
| `limit` | X | `20` | 한 번에 조회할 로그 수. `1~100` 사이의 정수 |
| `cursor` | X | 없음 | 이전 응답의 `data.page.nextCursor`. 다음 페이지 조회 시 사용 |

첫 요청에서는 `cursor`를 보내지 않는다.

## 정상 응답

```json
{
  "data": {
    "assetId": "20000000-0000-4000-8000-000000000002",
    "logs": [
      {
        "request_id": "3c783fa9-0ff1-401c-8c97-96bc05687cdb",
        "vendor_code": "NDPS",
        "event_external_id": "WEB-NDPS-1787291434523",
        "payload_type": "TVWS",
        "delivery_mode": "DELIVER",
        "source_device_id": "20000000-0000-4000-8000-000000000010",
        "reported_by_device_id": "20000000-0000-4000-8000-000000000003",
        "occurred_at": "2026-08-21T05:50:34.523+00:00",
        "received_at": "2026-08-21T05:50:41.025031+00:00",
        "status": "PERSISTED",
        "payload": {
          "context": {
            "eventExternalId": "WEB-NDPS-1787291434523",
            "sourceSystem": "web-test-dashboard",
            "occurredAt": "2026-08-21T05:50:34.523Z",
            "sourceDeviceId": "20000000-0000-4000-8000-000000000010",
            "reportedByDeviceId": "20000000-0000-4000-8000-000000000003"
          },
          "activePath": [
            {
              "sequence": 1,
              "fromDeviceId": "20000000-0000-4000-8000-000000000010",
              "toDeviceId": "20000000-0000-4000-8000-000000000002",
              "medium": "TVWS",
              "evidenceType": "OBSERVED"
            }
          ],
          "data": {
            "baseDeviceId": "20000000-0000-4000-8000-000000000002",
            "cpeDeviceId": "20000000-0000-4000-8000-000000000010",
            "observedAt": "2026-08-21T05:50:34.523Z",
            "operationalStatus": "ONLINE"
          }
        }
      }
    ],
    "page": {
      "limit": 20,
      "hasMore": true,
      "nextCursor": "2026-08-21T05:39:45.584576+00:00"
    }
  }
}
```

### 주요 응답 필드

| 필드 | 설명 |
|---|---|
| `logs` | 해당 장비와 관련된 로그 목록. `received_at` 최신순 |
| `request_id` | Vendor 요청의 멱등성 및 원본 메시지 식별 UUID |
| `vendor_code` | 요청 업체. `NDPS` 또는 `JININFRA` |
| `event_external_id` | 업체 또는 송신 시스템이 지정한 이벤트 식별자 |
| `delivery_mode` | DB에 저장된 요청 처리 모드. 현재 `DELIVER`만 반환 |
| `source_device_id` | 메시지의 주 송신 장비 UUID |
| `reported_by_device_id` | 메시지를 보고한 장비 UUID |
| `occurred_at` | 장비 측 이벤트 발생 시각 |
| `received_at` | Core 서버가 메시지를 받은 시각 |
| `status` | Core 저장 상태 |
| `payload` | 장비 식별자가 Core asset UUID로 변환된 전체 장비 연동 메시지 |
| `page.hasMore` | 다음 페이지 존재 여부 |
| `page.nextCursor` | 다음 페이지 요청에 사용할 cursor. 마지막 페이지이면 `null` |

## 관련 로그 판정

요청한 `assetId`가 다음 위치 중 하나에 있으면 관련 로그로 반환한다.

- 주 송신 장비 또는 보고 장비
- Base, CPE, Gateway, Terminal 장비
- 수신 단말 목록
- `activePath`의 출발 장비 또는 도착 장비

따라서 해당 장비가 메시지를 직접 송신하지 않았더라도 통신 상대나 경로 구성 장비로 포함되어 있으면 조회된다.

## payload 저장 구조

`payload`는 장비 데이터만 저장하는 필드가 아니다. Core가 처리한 전체 메시지를 보존하며 다음 항목을 포함한다.

| 위치 | 설명 |
|---|---|
| `payload.context` | 이벤트 ID, 발생 시각, 송신 장비와 보고 장비 UUID |
| `payload.activePath` | 장비 간 라우팅 경로, 순서, 통신 방식과 관측 근거 |
| `payload.observations` | 업체 요청에 포함된 개별 수신 관측값. 요청에 없으면 생략 가능 |
| `payload.data` | NDPS 또는 진인프라 장비별 상태·위치·품질 데이터 |

`activePath.fromDeviceId`, `activePath.toDeviceId`는 업체 장비번호가 아니라 Core asset UUID다. 필드명은 업체 요청 계약을 유지하기 위해 `DeviceId`를 사용한다. invoke 처리 응답의 `normalizedPath`에서는 같은 값을 `fromAssetId`, `toAssetId`라는 이름으로 보여준다.

## 다음 페이지 조회

첫 응답이 다음과 같다면:

```json
{
  "page": {
    "limit": 20,
    "hasMore": true,
    "nextCursor": "2026-08-21T05:39:45.584576+00:00"
  }
}
```

`nextCursor`를 URL 인코딩하여 다음 요청에 전달한다.

```http
GET /api/v1/dashboard/assets/20000000-0000-4000-8000-000000000002/logs?limit=20&cursor=2026-08-21T05%3A39%3A45.584576%2B00%3A00
```

`hasMore`가 `false`이면 추가 요청을 보내지 않는다.

## 프론트엔드 호출 예시

```ts
async function loadAssetLogs(assetId: string, cursor?: string) {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);

  const response = await fetch(
    `https://api.forest.tobeunicorn.kr/api/v1/dashboard/assets/${assetId}/logs?${params}`,
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "장비 로그 조회 실패");
  return body.data;
}
```

장비 상세 화면의 로그 영역을 처음 열 때 첫 페이지를 호출하고, 사용자가 **더 보기**를 누르거나 목록 하단에 도달했을 때 기존 `nextCursor`로 다음 페이지를 호출한다.

## 오류 응답

### 잘못된 요청

`assetId`가 UUID가 아니거나 `limit`, `cursor`가 올바르지 않으면 `400 Bad Request`를 반환한다.

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "limit은 1~100 사이여야 합니다."
  }
}
```

### 존재하지 않는 장비

```http
HTTP/1.1 404 Not Found
```

```json
{
  "error": {
    "code": "ASSET_NOT_FOUND",
    "message": "물리 장비를 찾을 수 없습니다."
  }
}
```

## 현재 상태

이 API는 운영 서버 `https://api.forest.tobeunicorn.kr`에 배포되어 있다.
