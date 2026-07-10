---
description: "구성 가능한 위치, 불투명도, 크기로 로고나 이미지를 워터마크로 오버레이합니다."
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: 86c2a20d62be
---

# Image Watermark {#image-watermark}

로고나 보조 이미지를 기본 이미지에 워터마크로 오버레이합니다. 워터마크는 기본 이미지 너비에 상대적으로 크기가 조정되며 모서리 또는 중앙에 배치됩니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

**두 개**의 이미지 파일과 JSON `settings` 필드를 담은 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bottom-right"` | 워터마크 배치: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | No | `50` | 워터마크 불투명도 백분율 (0 ~ 100) |
| scale | number | No | `25` | 메인 이미지 너비에 대한 워터마크 너비 백분율 (1 ~ 100) |

### File Fields {#file-fields}

| Field Name | Required | Description |
|------------|----------|-------------|
| file | Yes | 메인/기본 이미지 |
| watermark | Yes | 워터마크/로고 이미지 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Notes {#notes}

- 두 이미지 모두 검증되고 디코딩됩니다(HEIC, RAW, PSD, SVG 지원).
- 워터마크는 너비가 메인 이미지 너비의 `scale`%가 되도록 비례적으로 리사이즈됩니다.
- 불투명도는 `dest-in` 블렌딩으로 합성된 알파 마스크를 통해 적용됩니다.
- 모서리 위치는 이미지 가장자리로부터 20px 여백을 사용합니다.
- 워터마크 이미지에 투명도가 있으면(예: PNG 로고) 합성 중에 보존됩니다.
- 처리 전에 두 이미지 모두에 EXIF 방향이 자동으로 적용됩니다.
