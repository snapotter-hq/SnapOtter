---
description: "픽셀, 백분율 또는 맞춤 모드로 이미지 크기를 조정합니다."
i18n_source_hash: 53866e8266b8
i18n_provenance: human
i18n_output_hash: 52abf03aea71
---

# 이미지 크기 조정 {#resize}

정확한 픽셀 치수, 백분율 배율 계수, 또는 이미지가 대상 치수에 어떻게 맞춰지는지 제어하는 맞춤 모드를 지정하여 이미지 크기를 조정합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/resize`

이미지 파일과 JSON `settings` 필드가 포함된 multipart form data를 허용합니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | 대상 너비(픽셀, 최대 16383) |
| height | integer | No | - | 대상 높이(픽셀, 최대 16383) |
| fit | string | No | `"contain"` | 이미지가 치수에 맞춰지는 방식: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | No | `false` | 이미지가 대상보다 작으면 확대 방지 |
| percentage | number | No | - | 백분율로 크기 조정(예: 절반 크기는 50) |

`width`, `height`, `percentage` 중 최소 하나는 제공해야 합니다.

### Fit Modes {#fit-modes}

- **contain** - 종횡비를 유지하며 치수 안에 맞도록 크기 조정(빈 공간이 생길 수 있음)
- **cover** - 종횡비를 유지하며 치수를 덮도록 크기 조정(크롭될 수 있음)
- **fill** - 치수에 정확히 맞도록 늘림(종횡비 무시)
- **inside** - `contain`와 비슷하지만 축소만 하고 확대하지 않음
- **outside** - `cover`와 비슷하지만 축소만 하고 확대하지 않음

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

백분율로 크기 조정:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- 최대 치수는 각 축에서 16383픽셀입니다(Sharp/libvips 제한).
- 출력 형식은 입력 형식과 일치합니다. HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
- EXIF 방향은 크기 조정 전에 자동으로 적용됩니다.
- `withoutEnlargement` 플래그는 일부 이미지가 이미 대상보다 작을 수 있는 배치 처리에 유용합니다.
