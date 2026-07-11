---
description: "MP4, MOV, WebM, AVI, MKV 사이에서 비디오를 변환합니다."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: 07b7cef524b0
---

# Convert Video {#convert-video}

구성 가능한 품질 프리셋과 함께 MP4, MOV, WebM, AVI, MKV 형식 사이에서 비디오를 변환합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다. 이 엔드포인트는 비동기입니다. 즉시 `202 Accepted`를 반환하고 진행 상황은 `GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 스트리밍됩니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | 출력 형식: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | No | `"balanced"` | 품질 프리셋: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `high` 품질 프리셋은 최상의 시각적 충실도를 제공하지만 파일이 더 큽니다. `small` 프리셋은 최소 파일 크기를 위해 적극적으로 압축합니다.
- WebM 출력은 VP9 인코딩을 사용합니다. MP4와 MOV는 H.264를 사용합니다. AVI와 MKV는 레거시 또는 아카이브 워크플로용으로 제공됩니다.
- 작업이 완료될 때까지 진행 상황 업데이트는 `GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 제공됩니다.
