---
description: "밝기, 대비, 채도, 색온도, 색조, 채널을 조정하고 색상 효과를 적용합니다."
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: b1465d8e117e
---

# Adjust Colors {#adjust-colors}

밝기, 대비, 노출, 채도, 색온도, 틴트, 색조 회전, 채널별 레벨, 원클릭 효과(회색조, 세피아, 반전)를 단일 엔드포인트에서 결합한 종합 색상 조정 도구입니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

이미지 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| brightness | number | 아니요 | `0` | 밝기 조정 (-100 ~ 100) |
| contrast | number | 아니요 | `0` | 대비 조정 (-100 ~ 100) |
| exposure | number | 아니요 | `0` | 노출 / 중간톤 감마 (-100 ~ 100) |
| saturation | number | 아니요 | `0` | 색상 채도 (-100 ~ 100) |
| temperature | number | 아니요 | `0` | 화이트 밸런스: 차가운/파랑에서 따뜻한/주황 (-100 ~ 100) |
| tint | number | 아니요 | `0` | 틴트 시프트: 초록에서 마젠타 (-100 ~ 100) |
| hue | number | 아니요 | `0` | 색조 회전 각도 (-180 ~ 180) |
| sharpness | number | 아니요 | `0` | 선명도 강도 (0 ~ 100) |
| red | number | 아니요 | `100` | 빨강 채널 레벨 (0 ~ 200, 100 = 변경 없음) |
| green | number | 아니요 | `100` | 초록 채널 레벨 (0 ~ 200, 100 = 변경 없음) |
| blue | number | 아니요 | `100` | 파랑 채널 레벨 (0 ~ 200, 100 = 변경 없음) |
| effect | string | 아니요 | `"none"` | 색상 효과: `none`, `grayscale`, `sepia`, `invert` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

따뜻한 빈티지 룩 적용:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## 참고 사항 {#notes}

- 모든 매개변수는 중립 값을 기본값으로 하므로 필요한 것만 조정할 수 있습니다.
- 조정은 다음 순서로 적용됩니다: 밝기, 대비, 노출, 채도/색조, 색온도/틴트, 선명도, 채널, 효과.
- 색온도는 파랑-주황 및 초록-마젠타 축에서 3x3 색상 재결합 행렬을 사용합니다.
- 노출은 Sharp의 감마 함수에 매핑됩니다(양수는 중간톤을 밝게, 음수는 어둡게).
- 이 엔드포인트는 레거시 경로 `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels`, `/api/v1/tools/image/color-effects`에서도 응답합니다. 모두 동일한 스키마를 사용합니다.
- 출력 형식은 입력 형식과 일치합니다. HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
