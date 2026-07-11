---
description: "오디오 파일에서 무음 구간을 제거합니다."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: a3049e5d1602
---

# 무음 제거 {#silence-removal}

설정 가능한 임계값과 최소 지속 시간을 기준으로 오디오 파일에서 무음 구간을 감지하고 제거합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | 아니요 | `-50` | dB 단위의 무음 임계값(-80 ~ -20). 이 수준보다 낮은 오디오는 무음으로 간주됩니다. |
| minSilenceS | number | 아니요 | `0.5` | 제거할 최소 무음 지속 시간(초)(0.1 ~ 5) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## 참고 사항 {#notes}

- 임계값이 더 높으면(덜 음수) 더 공격적으로 동작하여 실제 무음뿐 아니라 더 조용한 구간까지 제거합니다.
- `minSilenceS` 값을 늘리면 짧은 자연스러운 간격은 유지하면서 더 긴 정지 구간만 제거합니다.
- 팟캐스트 녹음, 강의, 음성 메모를 정리하는 데 유용합니다.
- 출력은 보통 입력 컨테이너를 유지합니다. AAC 입력은 M4A로 기록되며, 디코드만 지원되는 입력 형식은 MP3로 대체됩니다.
