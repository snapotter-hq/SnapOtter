---
description: "방송 표준 레벨(EBU R128)에 맞춰 음량을 고르게 합니다."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: d946c4e6095f
---

# Normalize Audio {#normalize-audio}

EBU R128 정규화(-16 LUFS)를 사용해 오디오 음량을 방송 표준 레벨로 고르게 합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 파라미터 {#parameters}

이 도구에는 구성 가능한 파라미터가 없습니다. EBU R128 음량 정규화를 자동으로 적용합니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
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

- EBU R128 음량 표준을 사용하며 -16 LUFS를 목표로 합니다.
- 일관된 음량이 중요한 팟캐스트, 오디오북, 방송 콘텐츠에 이상적입니다.
- 소스 샘플 레이트는 출력에 보존됩니다.
- 출력은 보통 입력 컨테이너를 유지합니다. AAC 입력은 M4A로 작성되며, 지원되지 않는 디코드 전용 입력은 MP3로 폴백됩니다.
