---
description: "선택적 효과(블러, 그림자, 그라데이션, 사용자 지정 배경)를 갖춘 AI 기반 배경 제거."
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: aad6991b6e50
---

# Remove Background {#remove-background}

선택적 효과(블러, 그림자, 그라데이션, 사용자 지정 배경)를 갖춘 AI 기반 배경 제거.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Processing:** 비동기(202를 반환하며, SSE를 통해 `/api/v1/jobs/{jobId}/progress`에서 상태를 폴링)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

Phase 1은 배경을 제거하고 투명 PNG 마스크와 원본 이미지를 캐시합니다. 배경 교체, 블러, 드롭 섀도우, 출력 형식 변환은 [Phase 2 (`/api/v1/tools/image/remove-background/effects`)](#effects-endpoint-phase-2)에서(또는 `remove-background`를 파이프라인 단계나 배치 작업으로 실행할 때) 적용됩니다. 이러한 필드를 Phase 1에 전달하면 400을 반환합니다.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 이미지 파일(multipart) |
| model | string | No | - | 사용할 AI 모델 변형 |
| edgeRefine | integer | No | - | 가장자리 다듬기 수준(0~3) |
| decontaminate | boolean | No | - | 가장자리의 색 번짐 제거 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Effects Endpoint (Phase 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

AI 모델을 다시 실행하지 않고 배경 효과를 다시 적용합니다. Phase 1의 캐시된 마스크와 원본을 사용합니다.

### Parameters {#parameters-1}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| settings | JSON | Yes | - | 효과 설정이 담긴 JSON(아래 참조) |
| backgroundImage | file | `backgroundType`가 `image`일 때 필수 | - | 사용자 지정 배경 이미지 |

#### Settings JSON fields {#settings-json-fields}

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| jobId | string | Yes | - | Phase 1의 작업 ID |
| filename | string | Yes | - | Phase 1의 원본 파일 이름 |
| backgroundType | string | No | `"transparent"` | 다음 중 하나: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | `backgroundType`가 `color`일 때 필수 | - | Hex 색상: `#RRGGBB` 또는 `#RGB` (`#`는 선택 사항) |
| gradientColor1 | string | `backgroundType`가 `gradient`일 때 필수 | - | 첫 번째 그라데이션 색상, `backgroundColor`와 같은 hex 형식 |
| gradientColor2 | string | `backgroundType`가 `gradient`일 때 필수 | - | 두 번째 그라데이션 색상, `backgroundColor`와 같은 hex 형식 |
| gradientAngle | number | No | - | 그라데이션 각도(도) |
| blurEnabled | boolean | No | - | 피사체 뒤의 원본 배경을 흐리게 처리합니다(`backgroundType: "blur"`이면 자동 적용) |
| blurIntensity | number | No | - | 블러 강도(0-100) |
| shadowEnabled | boolean | No | - | 피사체에 드롭 섀도우 활성화 |
| shadowOpacity | number | No | `35` | 그림자 불투명도(0-100), `shadowEnabled`가 true일 때 사용 |
| outputFormat | string | No | `"png"` | 출력 형식: `png`, `webp`, `avif` |

### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

#### Error: Background Removal Expired (410) {#error-background-removal-expired-410}

effects 엔드포인트는 Phase 1이 `jobId`에 대해 저장해 둔 마스크와 원본으로 동작합니다. 저장된 출력은 일정 시간이 지나면 정리되므로, 두 호출 사이에 시간이 너무 많이 흐르면 사라집니다. 같은 이미지로 Phase 1을 다시 실행하고, 그때 반환된 `jobId`를 사용하세요.

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

저장된 파일을 가리킬 수 없는 `jobId` 또는 `filename`(경로 구분자, `..`, 빈 문자열)은 400으로 응답합니다.

## Notes {#notes}

- `background-removal` 모델 번들이 설치되어 있어야 합니다(4-5 GB).
- Phase 1은 투명 마스크와 원본 이미지를 캐시하므로 Phase 2(효과)에서 AI 모델을 다시 실행하지 않고도 다른 배경을 즉시 다시 적용할 수 있습니다.
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 자동 디코딩으로 지원합니다.
- EXIF 회전은 처리 전에 자동으로 보정됩니다.
