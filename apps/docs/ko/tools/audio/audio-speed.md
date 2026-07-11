---
description: "배율을 적용해 오디오 재생 속도를 빠르게 하거나 느리게 합니다."
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: dd484858fb15
---

# Audio Speed {#audio-speed}

속도 배율을 적용해 오디오 재생을 빠르게 하거나 느리게 합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 파라미터 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `1.5` | 속도 배율(0.25 ~ 4). 1 미만은 느려지고, 1 초과는 빨라집니다. |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## 참고 {#notes}

- `0.25` 배율은 1/4 속도로 재생됩니다(4배 길어짐). `4` 배율은 4배 속도로 재생됩니다(4배 짧아짐).
- 속도가 바뀌는 동안 피치는 보존됩니다(타임 스트레치). 피치를 독립적으로 조정하려면 pitch-shift를 사용하세요.
- 출력은 보통 입력 컨테이너를 유지합니다. AAC 입력은 M4A로 작성되며, 지원되지 않는 디코드 전용 입력은 MP3로 폴백됩니다.
