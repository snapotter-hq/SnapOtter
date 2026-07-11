---
description: "비디오에서 오디오 트랙을 추출합니다."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 89eebd10d257
---

# Extract Audio {#extract-audio}

비디오 파일에서 오디오 트랙을 추출하여 MP3, WAV, M4A 또는 OGG로 저장합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 출력 오디오 형식: `mp3`, `wav`, `m4a`, `ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- 비디오에 오디오 트랙이 없으면 요청은 400 오류를 반환합니다.
- MP3는 손실 형식이지만 널리 호환됩니다. WAV는 무손실이지만 용량이 큽니다. M4A(AAC)는 품질과 크기의 균형이 좋습니다. OGG는 오픈 코덱 워크플로용으로 제공됩니다.
- 원본 오디오가 이미 AAC이고 출력 형식이 M4A인 경우, 오디오 스트림은 재인코딩 없이 복사됩니다.
