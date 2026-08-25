# 재난 상황별 장비 조회 API

Dashboard에서 특정 재난 상황에 배정된 모든 장비와 장비별 임무 정보를 조회하는 API다.

## 기본 정보

| 항목 | 값 |
|---|---|
| 운영 주소 | `https://api.forest.tobeunicorn.kr` |
| Method | `GET` |
| Path | `/api/v1/dashboard/disasters/{disasterId}/assets` |
| 인증 | 현재 별도 API Key 없음 |
| 응답 형식 | `application/json` |

`disasterId`는 `core.disaster_event.event_id`에 저장된 UUID다. Core는 이 ID로 `core.event_resource`를 조회한 후 `core.asset`과 결합하여 장비를 반환한다.

```text
disaster_event.event_id
  → event_resource.event_id
  → event_resource.asset_id
  → asset.asset_id
```

## 요청

### Path parameter

| 이름 | 형식 | 필수 | 설명 |
|---|---|---:|---|
| `disasterId` | UUID | O | 조회할 재난 상황 ID |

### cURL

```bash
curl "https://api.forest.tobeunicorn.kr/api/v1/dashboard/disasters/10000000-0000-4000-8000-000000000001/assets"
```

### JavaScript

```javascript
const disasterId = "10000000-0000-4000-8000-000000000001";

const response = await fetch(
  `https://api.forest.tobeunicorn.kr/api/v1/dashboard/disasters/${encodeURIComponent(disasterId)}/assets`,
);

const result = await response.json();

if (!response.ok) {
  throw new Error(result.error?.message ?? "재난 장비 조회에 실패했습니다.");
}

console.log(result.data.disaster);
console.log(result.data.assets);
```

## 실제 운영 호출 예시

2026-08-25에 다음 재난 ID로 운영 API를 호출했다.

```http
GET /api/v1/dashboard/disasters/10000000-0000-4000-8000-000000000001/assets HTTP/1.1
Host: api.forest.tobeunicorn.kr
Accept: application/json
```

결과는 `HTTP 200 OK`였으며 약 1.37초가 걸렸다. 해당 재난에 매핑된 장비 4대가 반환됐다.

```json
{
  "data": {
    "disaster": {
      "disasterId": "10000000-0000-4000-8000-000000000001",
      "disasterCode": "SIM-WF-001",
      "disasterName": "산불 현장 통신망 실증",
      "disasterType": "WILDFIRE",
      "status": "RESPONDING"
    },
    "assets": [
      {
        "assignment": {
          "event_resource_id": "30000000-0000-4000-8000-000000000001",
          "event_id": "10000000-0000-4000-8000-000000000001",
          "asset_id": "20000000-0000-4000-8000-000000000001",
          "assigned_org_code": "FOREST-UAV",
          "mission": "최초 화선 정찰",
          "assigned_at": "2026-07-21T09:40:00+09:00",
          "released_at": null
        },
        "asset": {
          "asset_id": "20000000-0000-4000-8000-000000000001",
          "asset_code": "SIM-UAV-WF-01",
          "asset_type": "UAV",
          "asset_name": "산불 정찰 드론",
          "owner_org_code": "FOREST-UAV",
          "model_name": "Matrice-350",
          "serial_number": "SIM-UAV-WF-01",
          "status": "READY",
          "specifications": {
            "camera": "thermal",
            "flightMinutes": 45
          },
          "created_at": "2026-07-21T16:33:13.725091+09:00",
          "updated_at": "2026-07-21T16:33:13.725091+09:00"
        }
      }
    ],
    "assetCount": 4
  }
}
```

실제 응답의 `assets`에는 다음 장비 4대가 포함됐다.

| 장비 코드 | 장비명 | 유형 | 임무 | 상태 |
|---|---|---|---|---|
| `SIM-UAV-WF-01` | 산불 정찰 드론 | `UAV` | 최초 화선 정찰 | `READY` |
| `SIM-TVWS-BS-01` | 차량 탑재형 TVWS 기지국 | `TVWS_BASE_STATION` | TVWS 현장망 구축 | `READY` |
| `SIM-COMMAND-01` | 산불 현장지휘차량 | `COMMAND_VEHICLE` | 현장 통합지휘 | `READY` |
| `SIM-RTK-01` | 진화대원 RTK 단말 | `RTK_TERMINAL` | 진화대원 위치 송신 | `READY` |

## 응답 필드

### `data.disaster`

| 필드 | 설명 |
|---|---|
| `disasterId` | 재난 상황 UUID |
| `disasterCode` | 업무용 재난 코드 |
| `disasterName` | 재난 상황명 |
| `disasterType` | 재난 유형. 예: `WILDFIRE`, `LANDSLIDE` |
| `status` | 재난 대응 상태. 예: `RESPONDING`, `CLOSED` |

### `data.assets[]`

각 원소는 재난 배정 정보인 `assignment`와 장비 원장 정보인 `asset`으로 구성된다.

| 필드 | 설명 |
|---|---|
| `assignment.mission` | 해당 재난에서 장비가 수행하는 임무 |
| `assignment.assigned_org_code` | 장비 배정 기관 코드 |
| `assignment.assigned_at` | 배정 시각 |
| `assignment.released_at` | 해제 시각. 현재 투입 중이면 `null` |
| `asset.asset_id` | 통합 장비 UUID |
| `asset.asset_code` | 장비 업무 코드 |
| `asset.asset_type` | 장비 유형 |
| `asset.asset_name` | 장비명 |
| `asset.status` | 장비 원장 상태 |
| `asset.specifications` | 장비 유형별 상세 제원 |
| `assetCount` | 재난에 매핑된 전체 장비 수 |

`released_at` 값이 있는 장비도 재난 매핑 이력이므로 현재 API 결과에 포함된다. 현재 투입 중인 장비만 표시하려면 프론트엔드에서 `released_at === null`로 필터링한다.

## 오류 응답

### 잘못된 UUID — `400 Bad Request`

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "disasterId는 UUID 형식이어야 합니다."
  }
}
```

### 존재하지 않는 재난 — `404 Not Found`

```json
{
  "error": {
    "code": "DISASTER_NOT_FOUND",
    "message": "재난 상황을 찾을 수 없습니다."
  }
}
```

### 서버 또는 DB 처리 실패 — `502 Bad Gateway`

```json
{
  "error": {
    "code": "PROCESSING_FAILURE",
    "message": "오류 내용"
  }
}
```

## 프론트엔드 사용 시 주의사항

- `assetCount`가 `0`이어도 재난 상황이 존재하면 `200 OK`다.
- `404`는 장비가 없는 경우가 아니라 `disasterId` 자체가 존재하지 않는 경우다.
- `released_at`이 `null`이면 현재 재난에 투입 중인 장비다.
- `specifications`는 장비 유형별 JSON이므로 고정 필드로 가정하지 않는다.
- 날짜·시간은 ISO 8601 문자열로 처리한다.
