# 장비 등록 및 업체 연결 매뉴얼

대시보드 브라우저는 Core API만 호출한다. Core 등록 요청은 장비 UUID 발급과 업체 장비번호 연결을 하나의 트랜잭션으로 저장한다.

등록 성공은 UUID와 업체 연결 응답을 확인하고 상세 조회가 완료된 경우 표시한다. 등록 이후 상세 조회나 목록 갱신에 실패해도 장비는 이미 저장되었으므로 재등록하지 않고 조회를 재시도한다.

Vendor `/register`와 캐시 확인은 장비 연동 계층의 별도 작업이며 대시보드 등록 성공 기준에 포함하지 않는다. Core 저장 완료만으로 장비의 실시간 수신 상태를 `사용 가능`으로 표시하지 않는다.

## 1. 장비 유형 조회

```http
GET /api/v1/dashboard/asset-types
```

응답의 `asset_type_id`를 장비 등록 요청의 `assetTypeId`로 사용한다. 장비 유형 `code`는 사용하지 않는다.

## 2. 물리 장비 등록, UUID 발급 및 업체 연결

```http
POST /api/v1/dashboard/assets
Content-Type: application/json

{
  "assetCode": "DASH-UAV-01",
  "assetTypeId": "c16b731b-d24a-4376-9537-25cbcd7ebd4d",
  "assetName": "산불 정찰 드론 1호",
  "status": "READY",
  "productName": "Matrice 350 RTK",
  "modelName": "M350",
  "specifications": {
    "camera": "thermal"
  },
  "vendor": "NDPS",
  "vendorDeviceId": "NDPS-UAV-001",
  "deviceType": "UAV",
  "mappingStatus": "ACTIVE"
}
```

정상 응답은 `201 Created`이며 `data.asset_id`가 Core에서 발급한 물리 장비 UUID다. `data.vendor_mapping`에는 함께 생성된 업체 장비 연결이 포함된다. 프론트나 업체 서버에서 UUID를 생성하지 않는다.

자산 생성과 업체 장비 연결은 하나의 DB 트랜잭션으로 처리된다. 어느 한쪽이라도 실패하면 둘 다 저장되지 않는다. 지원 업체는 `NDPS`, `JININFRA`이며, 업체 안에서 `vendorDeviceId`는 유일하고 변경되지 않아야 한다.

`assetCode`는 운영 화면에서 사용하는 고유 관리 코드이며 UNIQUE 제약조건이 적용된다. 동일한 값은 `409 ASSET_CODE_CONFLICT`로 거부된다. 신규 화면은 연결 키로 사용하지 않지만, 현재 Core에는 기존 업체 호환을 위한 보조 매핑 조회가 남아 있다.

## 2-1. 등록 장비 목록 조회

```http
GET /api/v1/dashboard/assets?limit=100
```

`limit`은 선택값이며 기본값은 `100`, 허용 범위는 `1~200`이다. 최신 등록 순으로 자산을 반환하며 각 항목의 `vendor_mappings`에 업체 장비번호 연결을 포함한다.

```json
{
  "data": [
    {
      "asset_id": "20000000-0000-4000-8000-000000000099",
      "asset_code": "JIN-RTK-GATEWAY-001",
      "asset_name": "RTK 게이트웨이 1호",
      "status": "READY",
      "asset_type": { "asset_type_id": "...", "name": "LTE_GATEWAY" },
      "vendor_mappings": [
        {
          "vendor_code": "JININFRA",
          "vendor_device_id": "TEST0000000001",
          "device_type": "RTK_LPWA_GATEWAY",
          "status": "ACTIVE"
        }
      ]
    }
  ]
}
```

대시보드 등록 화면의 기본 연결 관계는 다음과 같다.

```text
vendor + vendorDeviceId
→ vendor_device_mapping
→ assetId
→ asset
```

현재 Core는 기존 업체 요청 호환을 위해 `vendor_device_mapping`이 없을 때 `asset.asset_code = vendorDeviceId`인 자산을 한 번 조회한다. 일치하면 매핑을 생성하고, 일치하지 않으면 `UNMAPPED`로 반환한다. 신규 등록 화면은 이 보조 동작에 의존하지 않고 2단계의 통합 등록 API를 호출한다.

## 3. 업체 register 확인 및 캐시 적재

```http
POST https://device.forest.tobeunicorn.kr/ndps/register
POST https://device.forest.tobeunicorn.kr/jininfra/register
```

업체 `/register`는 우선 기존 `vendor_device_mapping`을 확인하고 Vendor 서버 캐시에 적재한다. 매핑이 없으면 현재 Core의 기존 업체 호환 규칙에 따라 `vendorDeviceId`와 같은 `assetCode`를 가진 자산을 찾아 매핑할 수 있다. 자산 자체를 새로 생성하지는 않는다.

## 4. 데이터 수신 검증

```http
POST https://device.forest.tobeunicorn.kr/ndps/invoke?mode=VALIDATE_ONLY
POST https://device.forest.tobeunicorn.kr/jininfra/invoke?mode=VALIDATE_ONLY
```

정상 응답은 `accepted: true`, `persisted: false`다. 연결되지 않은 장비가 포함되면 `UNMAPPED`로 처리한다.

## 5. 물리 장비 조회

```http
GET /api/v1/dashboard/assets/{assetId}
```

대시보드 쓰기 API는 인터넷에 익명 공개하지 않고 배포 환경의 인증·인가 계층 뒤에서 호출해야 한다.
