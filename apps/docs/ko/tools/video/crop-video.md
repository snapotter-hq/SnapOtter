---
description: "비디오에서 특정 영역을 잘라냅니다."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: 38f9db478720
---

# Crop Video {#crop-video}

영역의 크기와 위치를 지정하여 비디오에서 직사각형 영역을 잘라냅니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | 크롭 영역 너비(픽셀, 최소 16) |
| height | integer | Yes | - | 크롭 영역 높이(픽셀, 최소 16) |
| x | integer | No | `0` | 왼쪽 위 모서리로부터의 수평 오프셋 |
| y | integer | No | `0` | 왼쪽 위 모서리로부터의 수직 오프셋 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- 크롭 영역은 비디오 크기 안에 맞아야 합니다. `x + width` 또는 `y + height`가 원본 크기를 초과하면 요청은 400 오류를 반환합니다.
- 최소 크롭 크기는 16x16 픽셀입니다.
- 대부분의 비디오 코덱이 요구하는 대로 크기는 짝수로 반올림됩니다.
