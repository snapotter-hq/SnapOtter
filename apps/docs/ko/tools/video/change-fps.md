---
description: "비디오의 프레임 레이트를 변경합니다."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 7257b5e1c7f2
---

# Change FPS {#change-fps}

비디오의 프레임 레이트를 1에서 120 fps 사이의 목표 값으로 변경합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | 목표 프레임 레이트(1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- 프레임 레이트를 낮추면 프레임이 삭제되어 파일 크기가 줄어듭니다. 높이면 빈 공간을 채우기 위해 프레임이 복제되지만 실제 모션 디테일이 추가되지는 않습니다.
- 일반적인 목표 값: 24(영화), 30(웹/방송), 60(부드러운 재생).
- 오디오 트랙은 원래 샘플 레이트로 유지됩니다.
