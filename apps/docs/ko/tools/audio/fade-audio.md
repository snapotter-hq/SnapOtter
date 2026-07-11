---
description: "오디오에 페이드 인 및 페이드 아웃 효과를 추가합니다."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: c4ccca38ac60
---

# Fade Audio {#fade-audio}

오디오 파일의 시작과 끝에 페이드 인 및 페이드 아웃 효과를 추가합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 파라미터 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fadeInS | number | No | `1` | 페이드 인 길이(초 단위, 0 ~ 30) |
| fadeOutS | number | No | `1` | 페이드 아웃 길이(초 단위, 0 ~ 30) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
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

- 해당 페이드 방향을 건너뛰려면 값을 `0`으로 설정하세요. 최소 하나는 0보다 커야 합니다.
- 페이드 길이가 오디오 길이를 초과하면 오디오 길이로 제한됩니다.
- 출력은 보통 입력 컨테이너를 유지합니다. AAC 입력은 M4A로 작성되며, 지원되지 않는 디코드 전용 입력은 MP3로 폴백됩니다.
