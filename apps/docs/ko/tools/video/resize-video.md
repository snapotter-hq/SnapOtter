---
description: "비디오를 새 해상도 또는 프리셋 크기로 스케일합니다."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: 82da6fe0ce19
---

# Resize Video {#resize-video}

사용자 지정 픽셀 크기 또는 표준 프리셋을 사용하여 비디오를 새 해상도로 스케일합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | 목표 너비(픽셀, 16-7680) |
| height | integer | No | - | 목표 높이(픽셀, 16-4320) |
| preset | string | No | `"custom"` | 해상도 프리셋: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

`preset`가 `"custom"`일 때는 `width` 또는 `height` 중 최소 하나를 제공해야 합니다. 나머지 차원은 비례하여 스케일됩니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

사용자 지정 크기로 리사이즈:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- 프리셋 값은 표준 높이에 매핑됩니다(예: `720p` = 1280x720, `1080p` = 1920x1080). 너비는 원본 종횡비로부터 비례하여 스케일됩니다.
- 대부분의 비디오 코덱이 요구하는 대로 크기는 짝수로 반올림됩니다.
- 지원되는 최대 해상도는 7680x4320(8K UHD)입니다.
