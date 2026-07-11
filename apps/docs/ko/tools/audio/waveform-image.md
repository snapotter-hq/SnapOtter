---
description: "오디오 파일로부터 파형 시각화를 PNG 이미지로 생성합니다."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: cba8f5d221b5
---

# 파형 이미지 {#waveform-image}

설정 가능한 크기와 색상으로 오디오 파일로부터 파형 시각화를 PNG 이미지로 생성합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| width | integer | 아니요 | `1024` | 이미지 너비(픽셀)(256 ~ 3840) |
| height | integer | 아니요 | `256` | 이미지 높이(픽셀)(64 ~ 1080) |
| color | string | 아니요 | `"#4f46e5"` | 파형 hex 색상(예: `"#4f46e5"`) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## 참고 사항 {#notes}

- 입력 오디오 형식과 관계없이 출력은 항상 PNG 이미지입니다.
- 파형은 투명 배경에 렌더링됩니다.
- 썸네일, 소셜 미디어 미리보기, 또는 웹 페이지 임베딩에 유용합니다.
