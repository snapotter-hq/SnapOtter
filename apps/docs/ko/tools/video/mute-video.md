---
description: "비디오에서 오디오 트랙을 제거합니다."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: d9aaf7709d76
---

# Mute Video {#mute-video}

비디오에서 오디오 트랙을 제거하여 시각적 스트림만 남깁니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

비디오 파일이 담긴 multipart form data를 받습니다. 이 도구에는 구성 가능한 설정이 없습니다.

## Parameters {#parameters}

이 도구에는 매개변수가 없습니다. 업로드된 비디오에서 오디오 트랙을 제거합니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- 비디오 스트림은 재인코딩 없이 복사되므로 품질 손실이 없습니다.
- 입력 비디오에 오디오 트랙이 없으면 파일이 변경 없이 반환됩니다.
