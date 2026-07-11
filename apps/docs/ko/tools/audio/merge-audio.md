---
description: "여러 오디오 파일을 하나의 순차적 트랙으로 결합합니다."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: 78d0fad5d829
---

# Merge Audio {#merge-audio}

두 개 이상의 오디오 파일을 업로드된 순서대로 이어붙여 하나의 순차적 트랙으로 결합합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

여러 오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 파라미터 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 출력 형식: `mp3`, `wav`, `flac`, `m4a` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## 참고 {#notes}

- 요청당 2개에서 10개의 오디오 파일을 받습니다.
- 파일은 업로드 순서대로 이어붙여집니다.
- 모든 입력 파일은 매끄러운 결합을 위해 선택한 출력 형식과 샘플 레이트로 다시 인코딩됩니다.
- 혼합된 입력 형식이 지원됩니다(예: WAV 하나와 MP3 하나).
