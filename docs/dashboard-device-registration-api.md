# 장비 등록 및 업체 연결 매뉴얼

장비업체 사용자는 등록 화면에서 장비 정보와 업체 장비번호를 한 번 입력하고 제출한다. Core는 하나의 API 요청에서 UUID 발급과 업체 장비번호 연결을 함께 완료하고, 프론트는 이어서 Vendor 캐시 적재를 확인한다.

```text
업체가 등록 화면 입력
→ POST assets로 assetId 발급 + 업체 장비번호 연결
→ 업체 register로 캐시 적재 확인
→ 발급 UUID와 연결 완료 표시
→ 업체 invoke 즉시 사용
```

업체 화면에서는 위 과정을 하나의 **등록 및 연결** 동작으로 제공한다. 사용자가 API 단계를 각각 실행하게 하지 않는다.

화면 상태는 다음처럼 구분한다.

| 상태 | 기준 |
|---|---|
| `전산 등록·업체 연결` | Core에서 `assetId` 발급과 `vendor_device_mapping` 저장을 함께 완료 |
| `사용 가능` | 업체 `/register` 응답이 `MAPPED` |
| `연결 오류` | 현재 단계 실패 또는 `UNMAPPED` |

`assetId`가 존재한다는 이유만으로 `사용 가능`으로 표시하지 않는다. 업체 `/register`의 `MAPPED` 응답까지 확인해야 한다.

Vendor 캐시는 서버 재시작 시 비워질 수 있으므로 상세 화면에서 상태를 다시 확인할 때 `/register`를 재호출할 수 있다. 명시적 매핑이 유지되어 있으면 같은 `assetId`가 반환된다.

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
