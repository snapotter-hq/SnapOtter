---
description: "오디오 파일을 뒤집어 거꾸로 재생되게 합니다."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 374abee091f2
---

# Reverse Audio {#reverse-audio}

오디오 파일을 뒤집어 거꾸로 재생되게 합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 파라미터 {#parameters}

이 도구에는 구성 가능한 파라미터가 없습니다. 전체 오디오 파일이 뒤집힙니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- 전체 오디오 트랙이 끝에서 시작으로 뒤집힙니다.
- 출력은 보통 입력 컨테이너를 유지합니다. AAC 입력은 M4A로 작성되며, 지원되지 않는 디코드 전용 입력은 MP3로 폴백됩니다.
