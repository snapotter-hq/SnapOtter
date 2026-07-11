---
description: "FFT 기반 노이즈 제거로 오디오의 배경 잡음을 줄입니다."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: da749f3cf1bb
---

# Noise Reduction {#noise-reduction}

선택 가능한 강도의 FFT 기반 노이즈 제거를 사용해 오디오 파일의 배경 잡음을 줄입니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 파라미터 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strength | string | No | `"medium"` | 노이즈 제거 강도: `light`, `medium`, `strong` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
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

- `light`은 더 많은 디테일을 보존하지만 잡음을 덜 제거합니다. `strong`은 잡음을 더 많이 제거하지만 미세한 아티팩트가 생길 수 있습니다.
- 일관된 배경 잡음(팬 소리, 에어컨, 잡음)이 있는 녹음에서 가장 좋은 결과를 냅니다.
- 출력은 보통 입력 컨테이너를 유지합니다. AAC 입력은 M4A로 작성되며, 지원되지 않는 디코드 전용 입력은 MP3로 폴백됩니다.
