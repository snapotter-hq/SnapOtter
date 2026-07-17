---
description: "MP3, WAV, OGG, FLAC, M4A 형식 간에 오디오를 변환합니다."
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: fb55ca6c563e
---

# Convert Audio {#convert-audio}

MP3, WAV, OGG, FLAC, M4A를 포함한 일반적인 형식 간에 오디오 파일을 변환하며, 출력 비트레이트와 샘플 레이트를 구성할 수 있습니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 파라미터 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 출력 형식: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | No | `192` | 출력 비트레이트(kbps 단위, 32 ~ 320) |
| sampleRate | integer | No | 원본 레이트 | 출력 샘플 레이트(Hz 단위): `8000`, `16000`, `22050`, `32000`, `44100`, `48000` 또는 `96000`. 생략하면 원본 레이트 유지 |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## 참고 {#notes}

- 지원되는 입력 형식에는 MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF, OPUS가 포함됩니다.
- 비트레이트는 손실 형식(MP3, OGG, M4A)에만 적용됩니다. WAV 및 FLAC 같은 무손실 형식은 이 설정을 무시합니다.
- MP3 출력은 최대 48000 Hz의 샘플 레이트를 지원합니다. 96000 Hz 옵션은 WAV, OGG, FLAC, M4A에만 적용됩니다.
- MP3 비트레이트는 샘플 레이트에 따라 상한이 정해집니다. 8000 Hz에서는 최대 64 kbps, 16000 또는 22050 Hz에서는 최대 160 kbps입니다. 상한을 초과하는 요청은 조용히 낮춰지는 대신 거부됩니다.
- 출력 파일 이름은 원래 이름을 유지하고 새 확장자를 사용합니다.
