---
description: "비디오 클립을 거꾸로 재생합니다."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: 14762d359cc7
---

# Reverse Video {#reverse-video}

비디오 클립을 거꾸로 재생합니다. 오디오 트랙도 역재생됩니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

비디오 파일이 담긴 multipart form data를 받습니다. 이 도구에는 구성 가능한 설정이 없습니다.

## Parameters {#parameters}

이 도구에는 매개변수가 없습니다. 전체 비디오를 역재생합니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- 길이가 최대 5분인 클립으로 제한됩니다. 더 긴 비디오는 400 오류로 거부됩니다.
- 비디오와 오디오 트랙이 모두 역재생됩니다. 오디오 없이 비디오만 역재생하려면 먼저 음소거하세요.
