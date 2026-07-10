---
description: "드롭 섀도우와 배경 상자가 있는 스타일 텍스트 오버레이를 추가합니다."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: 15b90b055b64
---

# Text Overlay {#text-overlay}

선택적 드롭 섀도우와 반투명 배경 상자와 함께 스타일이 적용된 텍스트를 이미지에 추가합니다. 사진의 제목, 캡션 또는 주석에 적합합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

이미지 파일과 JSON `settings` 필드를 담은 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | 오버레이할 텍스트 (1 ~ 500자) |
| fontSize | number | No | `48` | 글꼴 크기(픽셀) (8 ~ 200) |
| color | string | No | `"#FFFFFF"` | 텍스트 색상(hex 형식, `#RRGGBB`) |
| position | string | No | `"bottom"` | 수직 배치: `top`, `center`, `bottom` |
| backgroundBox | boolean | No | `false` | 텍스트 뒤에 반투명 배경 사각형 표시 |
| backgroundColor | string | No | `"#000000"` | 배경 상자 색상(hex 형식, `#RRGGBB`) |
| shadow | boolean | No | `true` | 텍스트 뒤에 드롭 섀도우 적용 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

배경 상자 포함:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- 텍스트는 항상 이미지 내에서 수평으로 가운데 정렬됩니다.
- 드롭 섀도우는 70% 검정 불투명도로 2px 오프셋과 3px 블러를 사용합니다.
- 배경 상자는 70% 불투명도로 전체 이미지 너비를 덮으며, 높이는 글꼴 크기에 비례합니다(1.8배).
- 텍스트는 SVG 합성을 통해 렌더링되므로 시스템의 기본 sans-serif 글꼴이 사용됩니다.
- 텍스트의 XML 특수 문자는 안전하게 이스케이프됩니다.
- 출력 형식은 입력 형식과 일치합니다. HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
