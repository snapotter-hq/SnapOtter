---
description: "MP3, WAV, OGG, FLAC, M4A 형식 간에 오디오를 변환합니다."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: fb55ca6c563e
---

# Convert Audio {#convert-audio}

MP3, WAV, OGG, FLAC, M4A를 포함한 일반적인 형식 간에 오디오 파일을 변환하며, 출력 비트레이트를 구성할 수 있습니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 파라미터 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 출력 형식: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | No | `192` | 출력 비트레이트(kbps 단위, 32 ~ 320) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## 참고 {#notes}

- 지원되는 입력 형식에는 MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF, OPUS가 포함됩니다.
- 비트레이트는 손실 형식(MP3, OGG, M4A)에만 적용됩니다. WAV 및 FLAC 같은 무손실 형식은 이 설정을 무시합니다.
- 출력 파일 이름은 원래 이름을 유지하고 새 확장자를 사용합니다.
