---
description: "비디오를 빠르게 또는 느리게 재생합니다."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: 3434a48c6b60
---

# Video Speed {#video-speed}

오디오 피치를 유지하는 옵션과 함께 비디오를 빠르게 또는 느리게 재생합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | 속도 배율(0.25-4). 1보다 크면 빠르게, 작으면 느리게 |
| keepPitch | boolean | No | `true` | 속도 변경 시 오디오 피치 유지 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- `2` 배율은 재생 속도를 두 배로 늘립니다(지속 시간 절반). `0.5` 배율은 재생 속도를 절반으로 줄입니다(지속 시간 두 배).
- `keepPitch`가 `true`이면 오디오가 시간 늘림 처리되어 음성이 자연스럽게 들립니다. `false`이면 피치가 속도에 비례하여 이동합니다.
- 유효 범위는 0.25x에서 4x입니다.
