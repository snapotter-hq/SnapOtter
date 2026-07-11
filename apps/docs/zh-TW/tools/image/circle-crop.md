---
description: "將影像裁切為置中的圓形，並讓四角透明。"
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: f476bdd2646b
---

# Circle Crop {#circle-crop}

將影像裁切為置中的圓形，並讓四角透明。支援可調整的縮放、偏移、邊框及輸出尺寸。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

接受包含影像檔案及 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| zoom | number | No | `1` | 縮放係數（1-5）；數值越高裁切越緊 |
| offsetX | number | No | `0.5` | 水平中心位置（0-1） |
| offsetY | number | No | `0.5` | 垂直中心位置（0-1） |
| borderWidth | integer | No | `0` | 邊框寬度，以像素為單位（0-200） |
| borderColor | string | No | `"#ffffff"` | 邊框十六進位色碼 |
| background | string | No | `"transparent"` | 四角填充：`"transparent"` 或十六進位色碼 |
| outputSize | integer | No | - | 最終方形尺寸，以像素為單位（16-4096） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Notes {#notes}

- 輸出一律為 PNG 以保留透明的四角（除非 `background` 設為純色）。
- 圓形會內接於影像較短的一邊。使用 `zoom` 裁切得更緊，並使用 `offsetX`/`offsetY` 移動可見區域。
- 當提供 `outputSize` 時，結果會在裁切後調整為該方形尺寸。
- HEIC、RAW、PSD 及 SVG 輸入會在處理前自動解碼。
