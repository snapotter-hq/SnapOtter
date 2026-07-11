---
description: "비디오의 밝기, 대비, 채도, 감마를 조정합니다."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: 4185aaf9fd57
---

# Video Color {#video-color}

비디오의 밝기, 대비, 채도, 감마 보정을 조정합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | 밝기 조정(-1에서 1) |
| contrast | number | No | `1` | 대비 배율(0-4) |
| saturation | number | No | `1` | 채도 배율(0-3). 흑백은 0으로 설정 |
| gamma | number | No | `1` | 감마 보정(0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- 모든 값이 기본값(밝기 0, 대비 1, 채도 1, 감마 1)일 때는 변화가 없습니다.
- 채도를 `0`으로 설정하면 비디오가 흑백으로 변환됩니다.
- 1 미만의 감마 값은 그림자를 밝게 하고, 1 초과의 값은 어둡게 합니다.
