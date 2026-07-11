---
description: "AI를 사용하여 이미지 배경을 단색 또는 그라디언트로 교체합니다."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: cf63800fad7d
---

# Background Replace {#background-replace}

이미지 배경을 단색 또는 그라디언트로 교체합니다. AI 모델이 피사체를 감지하고, 원본 배경을 제거한 후, 선택한 배경 위에 피사체를 합성합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

이미지 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| backgroundType | string | 아니요 | `"color"` | 배경 모드: `color` 또는 `gradient` |
| color | string | 아니요 | `"#ffffff"` | 배경 16진수 색상 (backgroundType이 `color`일 때) |
| gradientColor1 | string | 아니요 | - | 첫 번째 그라디언트 16진수 색상 |
| gradientColor2 | string | 아니요 | - | 두 번째 그라디언트 16진수 색상 |
| gradientAngle | integer | 아니요 | `180` | 그라디언트 각도 (0-360) |
| feather | integer | 아니요 | `0` | 가장자리 페더링 반경 (0-20) |
| format | string | 아니요 | `"png"` | 출력 형식: `png` 또는 `webp` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

`GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 진행 상황을 추적할 수 있습니다. 작업이 완료되면 SSE 스트림이 다운로드 URL과 함께 `completed` 이벤트를 발생시킵니다.

## 참고 사항 {#notes}

- 이 도구는 `202 Accepted`을(를) 반환하고 비동기적으로 처리하는 AI 기반 도구입니다. 진행 상황 업데이트와 최종 결과를 받으려면 SSE 엔드포인트에 연결하세요.
- **background-removal** 기능 번들이 설치되어 있어야 합니다. 번들을 사용할 수 없는 경우 `501`을(를) 반환합니다.
- HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
- 피사체 주변의 투명도를 유지하기 위해 출력은 기본적으로 PNG로 설정됩니다.
