---
description: "調整亮度、對比、飽和度、色溫、色相、色版，並套用色彩效果。"
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: 89962a15c752
---

# Adjust Colors {#adjust-colors}

完整的色彩調整工具，在單一端點中整合了亮度、對比、曝光、飽和度、色溫、色調、色相旋轉、各色版色階，以及一鍵效果（灰階、懷舊、反相）。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

接受包含影像檔案及 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | 亮度調整（-100 至 100） |
| contrast | number | No | `0` | 對比調整（-100 至 100） |
| exposure | number | No | `0` | 曝光 / 中間調 gamma（-100 至 100） |
| saturation | number | No | `0` | 色彩飽和度（-100 至 100） |
| temperature | number | No | `0` | 白平衡：冷/藍到暖/橙（-100 至 100） |
| tint | number | No | `0` | 色調偏移：綠到洋紅（-100 至 100） |
| hue | number | No | `0` | 色相旋轉角度（-180 至 180） |
| sharpness | number | No | `0` | 銳化強度（0 至 100） |
| red | number | No | `100` | 紅色版色階（0 至 200，100 = 不變） |
| green | number | No | `100` | 綠色版色階（0 至 200，100 = 不變） |
| blue | number | No | `100` | 藍色版色階（0 至 200，100 = 不變） |
| effect | string | No | `"none"` | 色彩效果：`none`、`grayscale`、`sepia`、`invert` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

套用溫暖的復古風格：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes {#notes}

- 所有參數預設為中性值，因此你可以只調整需要的項目。
- 調整會依此順序套用：亮度、對比、曝光、飽和度/色相、色溫/色調、銳化、色版、效果。
- 色溫使用 3x3 色彩重組矩陣，作用於藍橙軸與綠洋紅軸。
- 曝光對應到 Sharp 的 gamma 函式（正值提亮中間調，負值壓暗中間調）。
- 此端點也回應舊版路徑 `/api/v1/tools/image/brightness-contrast`、`/api/v1/tools/image/saturation`、`/api/v1/tools/image/color-channels` 及 `/api/v1/tools/image/color-effects`。全部使用相同的結構描述。
- 輸出格式會與輸入格式相符。HEIC、RAW、PSD 及 SVG 輸入會在處理前自動解碼。
