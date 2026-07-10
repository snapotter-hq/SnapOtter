---
description: "어떤 오디오 파일에서든 벨소리 클립을 만듭니다."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: 55f7c1cd1173
---

# Ringtone Maker {#ringtone-maker}

시작 시간과 길이를 선택해 어떤 오디오 파일에서든 벨소리 클립(.m4r)을 만듭니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 파라미터 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | 시작 시간(초 단위, 최소 0) |
| durationS | number | No | `30` | 클립 길이(초 단위, 1 ~ 30) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## 참고 {#notes}

- 출력은 항상 M4R 형식이며 iPhone 벨소리와 호환됩니다.
- 최대 벨소리 길이는 30초입니다(Apple 제한).
- 어떤 오디오 형식이든 입력으로 사용할 수 있습니다.
