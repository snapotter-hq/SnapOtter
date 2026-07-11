---
description: "애니메이션 GIF를 MP4, WebM 또는 MOV 비디오로 변환합니다."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: 034c4ea4177d
---

# GIF to Video {#gif-to-video}

애니메이션 GIF를 용량이 작은 MP4, WebM 또는 MOV 비디오 파일로 변환합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

GIF 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | 출력 형식: `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- GIF를 비디오로 변환하면 동일한 시각적 품질을 유지하면서 일반적으로 파일 크기가 80-90% 줄어듭니다.
- 애니메이션 GIF 파일만 허용됩니다. 정적 이미지는 이미지 Convert 도구를 사용하세요.
- MP4와 MOV는 H.264 인코딩을 사용하고 WebM은 VP9를 사용합니다.
