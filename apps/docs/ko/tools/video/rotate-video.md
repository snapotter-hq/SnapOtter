---
description: "비디오를 회전하거나 뒤집습니다."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: cf2a97ee5823
---

# Rotate Video {#rotate-video}

비디오를 90, 180 또는 270도 회전하거나 수평 또는 수직으로 뒤집습니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | 적용할 변환: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - 시계 방향으로 90도 회전
- **ccw90** - 반시계 방향으로 90도 회전
- **180** - 180도 회전
- **hflip** - 수평으로 뒤집기(미러)
- **vflip** - 수직으로 뒤집기

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- 90 또는 270도 회전은 비디오의 너비와 높이를 교체합니다.
- 뒤집기 작업(hflip, vflip)은 비디오 크기를 변경하지 않습니다.
