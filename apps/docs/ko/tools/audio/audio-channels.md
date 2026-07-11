---
description: "모노와 스테레오 간 변환하거나 좌우 채널을 서로 바꿉니다."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: 3281d6a75db8
---

# Audio Channels {#audio-channels}

오디오를 모노와 스테레오 레이아웃 간에 변환하거나, 스테레오 파일의 좌우 채널을 서로 바꿉니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 파라미터 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Yes | - | 채널 작업: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## 참고 {#notes}

- `stereo-to-mono`은 두 채널을 하나의 모노 트랙으로 믹싱합니다.
- `mono-to-stereo`은 모노 채널을 좌우 양쪽으로 복제합니다.
- `swap`은 스테레오 파일의 좌우 채널을 서로 바꿉니다.
- 출력은 보통 입력 컨테이너를 유지합니다. AAC 입력은 M4A로 작성되며, 지원되지 않는 디코드 전용 입력은 MP3로 폴백됩니다.
