---
description: "ロゴや画像を、位置・不透明度・スケールを設定できるウォーターマークとして重ねます。"
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: 8f6fc69bb054
---

# Image Watermark {#image-watermark}

ロゴや別の画像を、ベース画像上にウォーターマークとして重ねます。ウォーターマークはベース画像の幅に対して相対的にスケールされ、角または中央に配置されます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

**2枚の**画像ファイルとJSON形式の`settings`フィールドを含むmultipartフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bottom-right"` | ウォーターマークの配置: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | No | `50` | ウォーターマークの不透明度の割合（0〜100） |
| scale | number | No | `25` | メイン画像の幅に対するウォーターマークの幅の割合（1〜100） |

### File Fields {#file-fields}

| Field Name | Required | Description |
|------------|----------|-------------|
| file | Yes | メイン/ベース画像 |
| watermark | Yes | ウォーターマーク/ロゴ画像 |

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

- 両方の画像が検証・デコードされます（HEIC、RAW、PSD、SVGに対応）。
- ウォーターマークは、その幅がメイン画像の幅の`scale`%になるよう、比例的にリサイズされます。
- 不透明度は、`dest-in`ブレンディングで合成されたアルファマスクを介して適用されます。
- 角の位置では、画像の縁から20pxの余白が設けられます。
- ウォーターマーク画像が透過を持つ場合（例: PNGロゴ）、合成時に透過は保持されます。
- 処理前に、両方の画像でEXIF方向が自動適用されます。
