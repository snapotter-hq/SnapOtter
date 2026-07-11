---
description: "비디오에서 자막 트랙을 SRT 파일로 추출합니다."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: 62284809c7a8
---

# Extract Subtitles {#extract-subtitles}

비디오 컨테이너에서 임베드된 자막 트랙을 추출하여 SRT 파일로 다운로드합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

비디오 파일이 담긴 multipart form data를 받습니다. 이 도구에는 구성 가능한 설정이 없습니다.

## Parameters {#parameters}

이 도구에는 매개변수가 없습니다. 비디오 컨테이너에서 발견된 첫 번째 자막 트랙을 추출합니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- 비디오에는 임베드된 자막 트랙이 있어야 합니다. 자막 트랙을 찾을 수 없으면 요청은 400 오류를 반환합니다.
- 비디오에 여러 자막 트랙이 있으면 첫 번째 트랙이 추출됩니다.
- 컨테이너 내 원본 자막 형식과 상관없이 출력 형식은 SRT입니다.
