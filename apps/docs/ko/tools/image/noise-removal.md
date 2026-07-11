---
description: "다단계 품질 옵션을 갖춘 AI 기반 노이즈 및 그레인 제거."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: 4146de35cfc6
---

# Noise Removal {#noise-removal}

Python 사이드카(SCUNet 모델)를 사용하는, 다단계 품질 옵션을 갖춘 AI 기반 노이즈 및 그레인 제거.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Processing:** 비동기(202를 반환하며, SSE를 통해 `/api/v1/jobs/{jobId}/progress`에서 상태를 폴링)

**Model bundle:** `upscale-enhance` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 이미지 파일(multipart) |
| tier | string | No | `"balanced"` | 품질 등급: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | No | `50` | 노이즈 제거 강도(0~100) |
| detailPreservation | number | No | `50` | 보존할 디테일 정도(0~100). 값이 높을수록 질감이 더 많이 유지됩니다 |
| colorNoise | number | No | `30` | 색상 노이즈 감소 강도(0~100) |
| format | string | No | `"original"` | 출력 형식: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | `90` | 출력 인코딩 품질(1~100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Notes {#notes}

- `upscale-enhance` 모델 번들이 설치되어 있어야 합니다(5-6 GB).
- 품질 등급은 속도와 품질을 맞바꿉니다. `quick`는 기본 노이즈 제거로 가장 빠르고, `maximum`는 가장 철저한 다중 패스 방식을 사용합니다.
- `detailPreservation` 매개변수는 질감이 있는 대상(천, 머리카락, 나뭇잎)에 매우 중요합니다. 값이 높을수록 노이즈 제거기가 미세한 디테일을 뭉개는 것을 방지합니다.
- `format`가 `"original"`로 설정되면 출력 형식이 입력 파일 형식과 일치합니다.
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 자동 디코딩으로 지원합니다.
