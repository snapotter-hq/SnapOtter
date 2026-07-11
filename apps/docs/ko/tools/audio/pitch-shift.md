---
description: "속도를 바꾸지 않고 오디오 피치를 반음 단위로 올리거나 내립니다."
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: 47d9f3295a37
---

# Pitch Shift {#pitch-shift}

재생 속도를 바꾸지 않고 오디오 파일의 피치를 반음 단위로 올리거나 내립니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 파라미터 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| semitones | integer | No | `3` | 이동할 반음 수(-12 ~ 12). 0이 아니어야 합니다. |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## 참고 {#notes}

- 양수 값은 피치를 올리고, 음수 값은 내립니다.
- 12반음 이동은 한 옥타브 위, -12는 한 옥타브 아래와 같습니다.
- 이동량과 관계없이 재생 길이는 동일하게 유지됩니다.
- 출력은 보통 입력 컨테이너를 유지합니다. AAC 입력은 M4A로 작성되며, 지원되지 않는 디코드 전용 입력은 MP3로 폴백됩니다.
