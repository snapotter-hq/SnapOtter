---
description: "데시벨 단위의 고정 게인으로 오디오 볼륨을 높이거나 낮춥니다."
i18n_source_hash: 4bc993fd4e08
i18n_provenance: human
i18n_output_hash: 6f5ebbf33cd7
---

# 볼륨 조정 {#volume-adjust}

데시벨 단위의 고정 게인을 적용하여 오디오 파일의 볼륨을 높이거나 낮춥니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| gainDb | number | 아니요 | `3` | 데시벨 단위의 볼륨 조정(-30 ~ 30) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
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

## 참고 사항 {#notes}

- 양수 값은 볼륨을 높이고, 음수 값은 낮춥니다.
- 큰 양의 게인은 클리핑을 유발할 수 있습니다. 라우드니스 안전 레벨링을 위해서는 normalize-audio를 사용하세요.
- 출력은 보통 입력 컨테이너를 유지합니다. AAC 입력은 M4A로 기록되며, 디코드만 지원되는 입력 형식은 MP3로 대체됩니다.
