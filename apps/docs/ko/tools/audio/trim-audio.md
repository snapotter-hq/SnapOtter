---
description: "시작 및 종료 시간을 지정하여 오디오 파일에서 구간을 잘라냅니다."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: c7ff8cf2638d
i18n_hash_version: 2
---

# 오디오 자르기 {#trim-audio}

오디오 파일에서 구간을 잘라냅니다. 시작 시간과 종료 시간 사이의 구간만 남기거나, 처음과 끝에서 정해진 길이만큼 잘라낼 수 있습니다.

앱에서는 시간 필드에 초 단위 숫자(`90`), `MM:SS`(`1:30`) 또는 `HH:MM:SS`(`1:02:03.5`)을 입력할 수 있습니다. API는 초 단위를 받습니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| mode | string | 아니요 | `range` | `range`는 `startS`부터 `endS`까지 남깁니다. `ends`는 처음에서 `cutStartS`, 끝에서 `cutEndS`만큼 제거합니다 |
| startS | number | 아니요 | `0` | range 모드: 시작 시간(초)(최소 0) |
| endS | number | range 모드 | - | range 모드: 종료 시간(초)(시작 시간 이후여야 함) |
| cutStartS | number | 아니요 | `0` | ends 모드: 처음에서 제거할 초 |
| cutEndS | number | 아니요 | `0` | ends 모드: 끝에서 제거할 초 |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

파일 길이와 관계없이 처음 2초와 마지막 3초를 잘라냅니다.

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
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
- range 모드에서 `endS`는 `startS`보다 커야 합니다. `endS`가 오디오 길이를 초과하면 파일이 끝까지 잘립니다.
- ends 모드에서는 `cutStartS`와 `cutEndS` 중 하나 이상이 0보다 커야 하며, 둘을 합쳐도 오디오가 최소 0.1초는 남아야 합니다. 자르는 길이를 각 파일 자체의 길이를 기준으로 계산하므로, 길이가 다른 여러 파일을 일괄 처리할 때도 하나의 설정으로 동작합니다.
- 출력은 보통 입력 컨테이너를 유지합니다. AAC 입력은 M4A로 기록되며, 디코드만 지원되는 입력 형식은 MP3로 대체됩니다.
