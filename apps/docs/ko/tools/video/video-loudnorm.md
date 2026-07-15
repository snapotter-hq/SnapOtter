---
description: "비디오 오디오 볼륨을 방송 표준으로 정규화합니다."
i18n_source_hash: c7a53b5faf1b
i18n_provenance: human
i18n_output_hash: c0432472f482
---

# 동영상 오디오 정규화 {#normalize-audio}

비디오 오디오 볼륨을 EBU R128 방송 라우드니스 표준으로 정규화합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

비디오 파일이 담긴 multipart form data를 받습니다. 이 도구에는 구성 가능한 설정이 없습니다.

## Parameters {#parameters}

이 도구에는 매개변수가 없습니다. 오디오 트랙에 EBU R128 라우드니스 정규화를 적용합니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- FFmpeg의 `loudnorm` 필터를 사용하여 -16 LUFS 통합 라우드니스, -1.5 dBTP 트루 피크, 11 LU 라우드니스 범위(EBU R128 방송 표준)를 목표로 합니다.
- 원본 오디오 샘플 레이트는 출력에서 유지됩니다.
- 비디오에 오디오 트랙이 없으면 요청은 400 오류를 반환합니다.
