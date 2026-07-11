---
description: "선택적 효과(블러, 그림자, 그라데이션, 사용자 지정 배경)를 갖춘 AI 기반 배경 제거."
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: 852e94e4f46f
---

# Remove Background {#remove-background}

선택적 효과(블러, 그림자, 그라데이션, 사용자 지정 배경)를 갖춘 AI 기반 배경 제거.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Processing:** 비동기(202를 반환하며, SSE를 통해 `/api/v1/jobs/{jobId}/progress`에서 상태를 폴링)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 이미지 파일(multipart) |
| model | string | No | - | 사용할 AI 모델 변형 |
| backgroundType | string | No | `"transparent"` | 다음 중 하나: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | No | - | 단색 배경의 Hex 색상 |
| gradientColor1 | string | No | - | 첫 번째 그라데이션 색상 |
| gradientColor2 | string | No | - | 두 번째 그라데이션 색상 |
| gradientAngle | number | No | - | 그라데이션 각도(도) |
| blurEnabled | boolean | No | - | 배경 블러 효과 활성화 |
| blurIntensity | number | No | - | 블러 강도(0~100) |
| shadowEnabled | boolean | No | - | 대상에 드롭 섀도우 활성화 |
| shadowOpacity | number | No | - | 그림자 불투명도(0~100) |
| outputFormat | string | No | - | 출력 형식: `png`, `webp`, 또는 `avif` |
| edgeRefine | integer | No | - | 가장자리 다듬기 수준(0~3) |
| decontaminate | boolean | No | - | 가장자리의 색 번짐 제거 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
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
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
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
| backgroundImage | file | No | - | 사용자 지정 배경 이미지(backgroundType이 `image`일 때) |

#### Settings JSON fields {#settings-json-fields}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| jobId | string | Yes | Phase 1의 작업 ID |
| filename | string | Yes | Phase 1의 원본 파일 이름 |
| backgroundType | string | No | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | No | 단색 배경의 Hex 색상 |
| gradientColor1 | string | No | 첫 번째 그라데이션 색상 |
| gradientColor2 | string | No | 두 번째 그라데이션 색상 |
| gradientAngle | number | No | 그라데이션 각도(도) |
| blurEnabled | boolean | No | 배경 블러 활성화 |
| blurIntensity | number | No | 블러 강도(0~100) |
| shadowEnabled | boolean | No | 드롭 섀도우 활성화 |
| shadowOpacity | number | No | 그림자 불투명도(0~100) |
| outputFormat | string | No | `png`, `webp`, 또는 `avif` |

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

## Notes {#notes}

- `background-removal` 모델 번들이 설치되어 있어야 합니다(4-5 GB).
- Phase 1은 투명 마스크와 원본 이미지를 캐시하므로 Phase 2(효과)에서 AI 모델을 다시 실행하지 않고도 다른 배경을 즉시 다시 적용할 수 있습니다.
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 자동 디코딩으로 지원합니다.
- EXIF 회전은 처리 전에 자동으로 보정됩니다.
