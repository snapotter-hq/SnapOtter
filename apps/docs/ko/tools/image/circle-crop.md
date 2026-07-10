---
description: "이미지를 투명한 모서리를 가진 중앙 정렬된 원으로 자릅니다."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 0ce2b2232702
---

# Circle Crop {#circle-crop}

이미지를 투명한 모서리를 가진 중앙 정렬된 원으로 자릅니다. 조정 가능한 확대/축소, 오프셋, 테두리, 출력 크기를 지원합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

이미지 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| zoom | number | 아니요 | `1` | 확대 계수 (1-5); 값이 높을수록 더 좁게 자름 |
| offsetX | number | 아니요 | `0.5` | 수평 중심 위치 (0-1) |
| offsetY | number | 아니요 | `0.5` | 수직 중심 위치 (0-1) |
| borderWidth | integer | 아니요 | `0` | 테두리 너비 픽셀 (0-200) |
| borderColor | string | 아니요 | `"#ffffff"` | 테두리 16진수 색상 |
| background | string | 아니요 | `"transparent"` | 모서리 채우기: `"transparent"` 또는 16진수 색상 |
| outputSize | integer | 아니요 | - | 최종 정사각형 크기 픽셀 (16-4096) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## 참고 사항 {#notes}

- 투명한 모서리를 유지하기 위해 출력은 항상 PNG입니다(`background`이(가) 단색으로 설정된 경우 제외).
- 원은 이미지의 짧은 쪽 안에 내접합니다. 더 좁게 자르려면 `zoom`을(를) 사용하고, 보이는 영역을 이동하려면 `offsetX`/`offsetY`을(를) 사용하세요.
- `outputSize`이(가) 제공되면, 자르기 후 결과가 해당 정사각형 크기로 조정됩니다.
- HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
