---
description: "미세한 디테일을 보존하면서 Real-ESRGAN AI 초해상도로 이미지를 2배에서 4배로 업스케일합니다."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: 79426b012629
---

# Image Upscaling {#image-upscaling}

Real-ESRGAN을 사용한 AI 초해상도 향상입니다. 디테일을 보존하면서 이미지를 2배~4배로 업스케일합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Processing:** 비동기 (202를 반환하며 SSE를 통해 상태를 확인하려면 `/api/v1/jobs/{jobId}/progress`을 폴링)

**Model bundle:** `upscale-enhance` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 이미지 파일 (multipart) |
| scale | number | No | `2` | 업스케일 배율 (예: 2, 3, 4) |
| model | string | No | `"auto"` | 사용할 모델 (예: `auto`, 특정 모델명) |
| faceEnhance | boolean | No | `false` | 업스케일 중 얼굴 향상 적용 |
| denoise | number | No | `0` | 노이즈 감소 강도 (0 = 끔) |
| format | string | No | `"auto"` | 출력 형식: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | No | `95` | 출력 품질 (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
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
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Notes {#notes}

- `upscale-enhance` 모델 번들(5-6 GB)이 설치되어 있어야 합니다.
- 사용 가능할 때는 Real-ESRGAN을 사용하며, AI 모델을 사용할 수 없으면 Lanczos 보간으로 폴백합니다.
- `faceEnhance` 옵션은 더 나은 얼굴 품질을 위해 업스케일 중 GFPGAN 얼굴 복원을 적용합니다.
- 브라우저에서 미리 볼 수 없는 출력 형식(HEIC, JXL, TIFF)의 경우 주 출력과 함께 WebP 미리보기가 생성됩니다.
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 자동 디코딩으로 지원합니다.
