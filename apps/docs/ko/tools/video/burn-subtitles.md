---
description: "자막을 비디오 프레임에 영구적으로 렌더링합니다."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: efc2c08c878e
---

# Burn Subtitles {#burn-subtitles}

SRT, VTT 또는 ASS 파일의 자막을 비디오의 모든 프레임에 영구적으로 렌더링(하드코딩)합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

비디오 파일과 자막 파일이 담긴 multipart form data를 받습니다. 이 엔드포인트는 비동기입니다. 즉시 `202 Accepted`를 반환하고 진행 상황은 `GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 스트리밍됩니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | 자막 글꼴 크기(픽셀, 8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 파일 두 개를 업로드하세요. 첫 번째는 비디오여야 하고 두 번째는 자막 파일(.srt, .vtt 또는 .ass)이어야 합니다.
- 구워진 자막은 비디오의 영구적인 일부가 되며 시청자가 끌 수 없습니다. 켜고 끌 수 있는 자막을 원한다면 대신 Embed Subtitles 도구를 사용하세요.
- 작업이 완료될 때까지 진행 상황 업데이트는 `GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 제공됩니다.
