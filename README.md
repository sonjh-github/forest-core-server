# forest-core-server

Supabase DB에 접근하는 유일한 Hono 본 서버다. 외부 장비는 이 서버에 직접 접근하지 않고 `vendors`를 경유한다.

## API

- `GET /health`: 본 서버·DB 상태
- `POST /internal/v1/device-mappings/resolve`: 장비번호 UUID 매핑
- `POST /internal/v1/vendor-messages`: 검증 또는 메시지 저장
- `GET /internal/v1/vendors/:vendor/health`: 업체별 수신 상태
- `GET /api/v1/dashboard/disasters/:disasterId/assets`: 재난 상황에 매핑된 모든 장비 조회
- `GET /api/v1/dashboard/asset-types`: 대시보드 장비 등록용 개념 장비 유형 조회
- `POST /api/v1/dashboard/assets`: 물리 장비 등록 및 UUID 발급
- `GET /api/v1/dashboard/assets/:assetId`: 등록된 물리 장비 조회
- `PUT /api/v1/dashboard/assets/:assetId/vendor-mappings`: 업체 장비번호를 물리 장비 UUID에 연결

## 소스 구조

- `src/device`: 장비 연동 서버와 통신하는 내부 API 및 처리 로직
- `src/dashboard`: 프론트엔드와 통신하는 공개 API
- `src/db`: 양쪽에서 공유하는 Supabase 접근 로직

`/internal/*`는 같은 EC2의 `forest-backend` Docker 네트워크에서만 접근시킨다. Supabase secret key는 이 서비스의 서버 환경변수에만 둔다.

## Docker 배포

```powershell
docker build -f dockerfile -t forest-core-server .
docker run -d --name forest-core-server --env-file .env -p 127.0.0.1:18020:18020 forest-core-server
```

`main` 브랜치 push 시 `.github/workflows/deploy.yml`이 타입검사와 이미지 빌드를 통과한 뒤 EC2의 `/home/ubuntu/server/forest-core-server`에 배포한다.
