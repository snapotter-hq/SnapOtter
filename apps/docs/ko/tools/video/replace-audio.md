---
description: "비디오의 오디오 트랙을 다른 파일로 교체합니다."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: 30f5365e9ba1
---

# Replace Audio {#replace-audio}

비디오의 오디오 트랙을 오디오 파일로 교체합니다. 비디오와 오디오 파일을 모두 업로드하세요.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

정확히 두 개의 파일이 담긴 multipart form data를 받습니다. 비디오 파일에 이어 오디오 파일입니다.

## Parameters {#parameters}

이 도구에는 설정 매개변수가 없습니다. 비디오 파일과 오디오 파일을 두 개의 `file` 파트로 업로드하세요.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- 정확히 두 개의 파일을 업로드해야 합니다. 첫 번째는 비디오여야 하고 두 번째는 오디오 파일이어야 합니다.
- 오디오 파일이 비디오보다 길면 비디오 길이에 맞게 잘립니다. 짧으면 나머지 비디오는 무음으로 재생됩니다.
- 비디오 스트림은 재인코딩 없이 복사되므로 비디오 품질 손실이 없습니다.
