---
description: "오디오를 시간 간격, 균등 분할, 또는 무음 감지로 분할합니다."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: 83fe986636de
---

# 오디오 분할 {#split-audio}

고정된 시간 간격, 균등 분할, 또는 자동 무음 감지를 기준으로 오디오 파일을 여러 세그먼트로 분할합니다. 세그먼트들이 담긴 ZIP 아카이브를 반환합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| mode | string | 아니요 | `"time"` | 분할 전략: `time`, `parts`, `silence` |
| segmentS | number | 아니요 | `60` | 세그먼트 길이(초), 1 ~ 3600(mode가 `time`일 때 사용) |
| parts | integer | 아니요 | `2` | 균등 분할 개수, 2 ~ 20(mode가 `parts`일 때 사용) |
| thresholdDb | number | 아니요 | `-40` | dB 단위의 무음 임계값, -80 ~ -20(mode가 `silence`일 때 사용) |
| minSilenceS | number | 아니요 | `0.3` | 최소 무음 간격(초), 0.1 ~ 10(mode가 `silence`일 때 사용) |

## 요청 예시 {#example-request}

30초 세그먼트로 분할:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

무음 감지로 분할:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## 참고 사항 {#notes}

- `downloadUrl`는 모든 세그먼트가 담긴 ZIP 아카이브를 가리킵니다.
- 선택한 `mode`에 관련된 매개변수만 사용되며, 나머지는 무시됩니다.
- 세그먼트 파일명은 순차적으로 번호가 매겨집니다(예: `part-000.mp3`, `part-001.mp3`).
- 출력 형식은 입력 형식과 일치합니다.
