---
description: "비디오 클립을 애니메이션 GIF로 만듭니다."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 55b4fbec9f67
---

# Video to GIF {#video-to-gif}

비디오 클립을 프레임 레이트, 너비, 시작 시간, 지속 시간을 구성할 수 있는 애니메이션 GIF로 만듭니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다. 이 엔드포인트는 비동기입니다. 즉시 `202 Accepted`를 반환하고 진행 상황은 `GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 스트리밍됩니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | 출력 프레임 레이트(1-30) |
| width | integer | No | `480` | 출력 너비(픽셀, 64-1280). 높이는 비례하여 스케일됨 |
| startS | number | No | `0` | 시작 시간(초, >= 0이어야 함) |
| durationS | number | No | `5` | 지속 시간(초, 0 초과, 최대 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `fps`과 `width` 값이 낮을수록 더 작은 GIF 파일을 생성합니다. 12 fps의 480px 너비 GIF가 보통 좋은 균형입니다.
- 최대 지속 시간은 60초입니다. 더 긴 클립은 매우 큰 파일을 생성합니다.
- 작업이 완료될 때까지 진행 상황 업데이트는 `GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 제공됩니다.
