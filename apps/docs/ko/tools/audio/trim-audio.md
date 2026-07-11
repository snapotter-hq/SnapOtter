---
description: "시작 및 종료 시간을 지정하여 오디오 파일에서 구간을 잘라냅니다."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: 782c84e1cc78
---

# 오디오 자르기 {#trim-audio}

시작 및 종료 시간을 초 단위로 지정하여 오디오 파일에서 구간을 잘라냅니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| startS | number | 아니요 | `0` | 시작 시간(초)(최소 0) |
| endS | number | 예 | - | 종료 시간(초)(시작 시간 이후여야 함) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## 참고 사항 {#notes}

- 시간은 초 단위로 지정하며 소수를 포함할 수 있습니다(예: `10.5`).
- `endS` 값은 `startS`보다 커야 합니다.
- `endS`가 오디오 길이를 초과하면 파일이 끝까지 잘립니다.
- 출력은 보통 입력 컨테이너를 유지합니다. AAC 입력은 M4A로 기록되며, 디코드만 지원되는 입력 형식은 MP3로 대체됩니다.
