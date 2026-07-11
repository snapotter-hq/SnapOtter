---
description: "이미지의 특정 색상을 다른 색상으로 바꾸거나 투명하게 만듭니다."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 47e7f74bbdf4
---

# Replace & Invert Color {#replace-invert-color}

원본 색상과 일치하는 픽셀을 대상 색상으로 바꾸거나 투명하게 만듭니다. RGB 공간에서 유클리드 거리를 사용하며, 색상 경계에서 부드러운 혼합을 위해 허용 오차를 설정할 수 있습니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

이미지 파일과 JSON `settings` 필드가 포함된 multipart form data를 허용합니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sourceColor | string | No | `"#FF0000"` | 찾을 Hex 색상(형식: `#RRGGBB`) |
| targetColor | string | No | `"#00FF00"` | 바꿀 Hex 색상(형식: `#RRGGBB`) |
| makeTransparent | boolean | No | `false` | 대상 색상으로 바꾸는 대신 일치하는 픽셀을 투명하게 만듦 |
| tolerance | number | No | `30` | 색상 매칭 허용 오차(0~255). 값이 높을수록 더 넓은 범위의 유사한 색상이 일치합니다 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

녹색 배경을 투명하게 만들기:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Notes {#notes}

- 색상 매칭은 RGB 공간에서 유클리드 거리를 사용하며 `tolerance * sqrt(3)`로 스케일링됩니다.
- 교체 혼합은 색상 거리에 비례합니다. 원본 색상에 가까운 픽셀일수록 대상 색상을 더 많이 받아 부드러운 전환을 만듭니다.
- `makeTransparent`가 `true`일 때, 입력 형식이 알파 채널을 지원하지 않으면(예: JPEG) 출력이 PNG(또는 WebP/AVIF)로 강제됩니다.
- 허용 오차 0은 정확히 일치하는 원본 색상만 매칭합니다. 값이 높을수록(50 이상) 더 넓은 범위의 유사한 색조가 일치합니다.
- 투명도가 필요하고 입력 형식이 알파를 지원하지 않는 경우가 아니면 출력 형식은 입력 형식과 일치합니다.
