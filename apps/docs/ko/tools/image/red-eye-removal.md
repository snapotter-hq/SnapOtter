---
description: "카메라 플래시로 인한 적목 현상을 AI로 감지하고 보정합니다."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: e4c36feb8806
---

# Red Eye Removal {#red-eye-removal}

카메라 플래시로 인한 적목 현상을 AI로 감지하고 보정합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Processing:** 비동기(202를 반환하며, SSE를 통해 `/api/v1/jobs/{jobId}/progress`에서 상태를 폴링)

**Model bundle:** `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 이미지 파일(multipart) |
| sensitivity | number | No | `50` | 적목 감지 민감도(0~100). 값이 높을수록 더 미묘한 적목을 감지합니다 |
| strength | number | No | `70` | 보정 강도(0~100). 적색을 얼마나 적극적으로 중화할지 결정합니다 |
| format | string | No | - | 출력 형식(선택적 재정의) |
| quality | number | No | `90` | 출력 품질(1~100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Notes {#notes}

- `face-detection` 모델 번들이 설치되어 있어야 합니다(200-300 MB).
- 먼저 얼굴을 감지하고, 각 얼굴 내에서 눈 영역을 찾은 다음, 마지막으로 적목 픽셀을 식별하고 보정합니다.
- `facesDetected` 수는 몇 개의 얼굴이 발견되었는지를 나타내고, `eyesCorrected`는 적목이 보정된 개별 눈의 총 개수입니다.
- 최대 품질 보존을 위해 출력은 항상 PNG입니다.
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 자동 디코딩으로 지원합니다.
