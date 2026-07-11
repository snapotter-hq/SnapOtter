---
description: "자막 트랙을 비디오 컨테이너에 먹싱합니다."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: 4fe610e21868
---

# Embed Subtitles {#embed-subtitles}

시청자가 켜고 끌 수 있는 소프트 자막 트랙으로 자막 파일을 비디오 컨테이너에 먹싱합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

비디오 파일과 자막 파일, 그리고 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | ISO 639-2/B 언어 코드(소문자 3자, 예: `"eng"`, `"fra"`, `"deu"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- 파일 두 개를 업로드하세요. 첫 번째는 비디오여야 하고 두 번째는 자막 파일(.srt, .vtt 또는 .ass)이어야 합니다.
- 임베드된(소프트) 자막은 시청자가 미디어 플레이어에서 켜고 끌 수 있습니다. 항상 표시되는 자막을 원한다면 대신 Burn Subtitles 도구를 사용하세요.
- 언어 코드는 컨테이너에 메타데이터로 저장되며 미디어 플레이어가 자막 트랙에 레이블을 붙이는 데 도움을 줍니다.
