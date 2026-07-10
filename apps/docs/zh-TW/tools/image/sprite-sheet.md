---
description: "將多張影像合併成單一精靈圖表網格，並附帶影格中繼資料。"
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: be852a091941
---

# 精靈圖表 {#sprite-sheet}

將多張影像合併成單一精靈圖表網格。每張影像會調整成與第一張影像相同的尺寸並置入網格中。回傳精靈圖表影像以及每個影格的座標中繼資料。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

接受包含兩張或以上影像檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| columns | integer | 否 | `4` | 網格的欄數（1-16） |
| padding | integer | 否 | `0` | 儲存格之間的內距（像素）（0-64） |
| background | string | 否 | `"#ffffff"` | 背景十六進位顏色 |
| format | string | 否 | `"png"` | 輸出格式：`png`、`webp` 或 `jpeg` |
| quality | integer | 否 | `90` | 輸出品質（1-100） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## 注意事項 {#notes}

- 接受 2 至 64 張影像。所有影像都會調整成與第一張上傳影像相同的尺寸。
- `frames` 陣列提供輸出中每個影格的精確像素座標，適用於 CSS 精靈定義或遊戲引擎影格對應表。
- 列數會依影像數量與 `columns` 值自動計算。
- 使用 `padding` 參數在儲存格之間加入間距。`background` 顏色會顯示在內距區域以及任何尾端的空儲存格中。
- HEIC、RAW、PSD 與 SVG 輸入會在處理前自動解碼。
