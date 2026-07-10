---
description: "以可預期、可控制的順序為影像加上邊框、內距、圓角及投影。"
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: a8a3bf91467b
---

# Border & Frame {#border-frame}

為影像加上邊框、內距、圓角及投影。此工具會依序套用效果：內距、邊框、圓角、然後陰影。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| borderWidth | number | No | 10 | 邊框粗細，以像素為單位（0 至 2000） |
| borderColor | string | No | `"#000000"` | 邊框顏色，以十六進位表示（例如 `#FF0000`） |
| padding | number | No | 0 | 影像與邊框之間的內距，以像素為單位（0 至 200） |
| paddingColor | string | No | `"#FFFFFF"` | 內距填充顏色，以十六進位表示 |
| cornerRadius | number | No | 0 | 圓角半徑，以像素為單位（0 至 2000） |
| shadow | boolean | No | `false` | 是否加上投影 |
| shadowBlur | number | No | 15 | 陰影模糊半徑（1 至 200） |
| shadowOffsetX | number | No | 0 | 陰影水平偏移（-50 至 50） |
| shadowOffsetY | number | No | 5 | 陰影垂直偏移（-50 至 50） |
| shadowColor | string | No | `"#000000"` | 陰影顏色，以十六進位表示 |
| shadowOpacity | number | No | 40 | 陰影不透明度百分比（0 至 100） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Notes {#notes}

- 使用標準的 `createToolRoute` 工廠。透過 multipart 上傳接受單一影像檔案。
- 支援 HEIC、RAW、PSD 及 SVG 輸入格式（自動解碼）。
- 處理順序：先加上內距，接著邊框環繞四周，然後套用圓角，最後合成陰影。
- 當啟用 `cornerRadius` 或 `shadow` 時，輸出會強制為 PNG（不論輸入格式為何）以保留透明度。支援 alpha 的格式（PNG、WebP、AVIF）會保留其原始格式。
- 陰影會依形狀變化：它會沿著圓角，而非產生矩形陰影。
- 將 `borderWidth` 設為 0 並僅使用 `cornerRadius` + `shadow`，可製作出無邊框的圓角陰影效果。
