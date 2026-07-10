---
description: "비디오에서 메타데이터를 제거하고 발견된 내용을 보고합니다."
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: 6675966d30e1
---

# Clean Video Metadata {#clean-video-metadata}

비디오에서 메타데이터(생성 날짜, GPS 좌표, 카메라 모델, 소프트웨어 태그 등)를 제거하고 제거된 내용을 보고합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

비디오 파일이 담긴 multipart form data를 받습니다. 이 도구에는 구성 가능한 설정이 없습니다.

## Parameters {#parameters}

이 도구에는 매개변수가 없습니다. 비디오 컨테이너에서 모든 메타데이터를 제거합니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes {#notes}

- 제거되는 메타데이터에는 생성 타임스탬프, GPS/위치 데이터, 카메라/기기 정보, 소프트웨어 태그가 포함됩니다.
- 비디오와 오디오 스트림은 재인코딩 없이 복사되므로 품질 손실이 없습니다.
- 비디오를 공개적으로 공유하기 전 개인정보 보호에 유용합니다.
