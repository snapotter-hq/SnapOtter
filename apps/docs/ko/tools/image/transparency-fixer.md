---
description: "AI 매팅(BiRefNet)으로 가짜 투명 PNG를 수정해 진짜 알파를 생성하며, 가장자리 정리를 위한 디프린지를 제공합니다."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: 777716f25d2d
---

# PNG Transparency Fixer {#png-transparency-fixer}

가짜 투명 PNG를 한 번의 클릭으로 수정합니다. AI 매팅(BiRefNet HR Matting 모델)을 사용해 진짜 알파 투명도를 생성하며, 가장자리를 정리하는 디프린지 후처리를 제공합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Processing:** 비동기 (202를 반환하며 SSE를 통해 상태를 확인하려면 `/api/v1/jobs/{jobId}/progress`을 폴링)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 이미지 파일 (multipart) |
| defringe | number | No | `30` | 디프린지 강도 (0-100). 가장자리 주위의 반투명 프린지 픽셀을 제거 |
| outputFormat | string | No | `"png"` | 출력 형식: `png` 또는 `webp` |
| removeWatermark | boolean | No | `false` | 워터마크 제거 전처리 적용(중앙값 필터) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Notes {#notes}

- `background-removal` 모델 번들(4-5 GB)이 설치되어 있어야 합니다.
- 고품질 알파 매팅의 기본 모델로 `birefnet-hr-matting`을 사용합니다. HR 모델이 메모리 부족을 겪으면 `birefnet-general`으로 폴백합니다.
- `defringe` 옵션은 AI 매팅이 머리카락, 털, 미세한 가장자리 주위에 남기는 경우가 있는 반투명 프린지 픽셀을 제거합니다. 알파 채널을 블러 처리하고 신뢰도가 낮은 픽셀을 0으로 만들어 작동합니다.
- `removeWatermark` 옵션은 중앙값 필터 전처리 단계를 적용합니다. 이는 기본적인 워터마크 감소이며 전용 워터마크 제거 도구가 아닙니다.
- PNG 또는 무손실 WebP만 출력합니다(둘 다 알파 투명도 지원).
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 자동 디코딩으로 지원합니다.
