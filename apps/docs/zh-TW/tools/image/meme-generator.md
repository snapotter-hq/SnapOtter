---
description: "使用範本或自訂圖片、樣式化文字方塊與字型選項來建立迷因。"
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: b988f567631e
---

# 迷因產生器 {#meme-generator}

使用內建範本或自訂圖片建立迷因。加入具有經典迷因樣式（粗體、帶外框的文字）的文字、多種版面配置預設值與字型選擇。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

接受下列其中一種：
- **Multipart 表單資料**，包含一個圖片檔案與一個 JSON `settings` 欄位（自訂圖片模式）
- **JSON 主體**，包含一個 `templateId`（範本模式，不需上傳檔案）

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| templateId | string | 否 | - | 內建迷因範本 ID。若提供此值，則不需上傳圖片 |
| textLayout | string | 否 | `"top-bottom"` | 文字方塊版面配置：`top-bottom`、`top-only`、`bottom-only`、`center`、`side-by-side` |
| textBoxes | array | 否 | `[]` | 文字方塊物件陣列，包含 `id` 與 `text` 欄位 |
| fontFamily | string | 否 | `"anton"` | 字型：`anton`、`arial-black`、`comic-sans`、`montserrat`、`bebas-neue`、`permanent-marker`、`roboto` |
| fontSize | number | 否 | auto | 字型大小（像素，8 至 200）。若省略則自動計算 |
| textColor | string | 否 | `"#ffffff"` | 文字填色 |
| strokeColor | string | 否 | `"#000000"` | 文字描邊／外框顏色 |
| textAlign | string | 否 | `"center"` | 文字對齊方式：`left`、`center`、`right` |
| allCaps | boolean | 否 | `true` | 將文字轉為大寫 |

### 文字方塊 {#text-boxes}

`textBoxes` 陣列中的每個項目應包含：

| 欄位 | 類型 | 說明 |
|-------|------|-------------|
| id | string | 對應版面配置的方塊識別碼（例如 `"top"`、`"bottom"`、`"left"`、`"right"`、`"center"`） |
| text | string | 要顯示的迷因文字 |

### 文字版面配置的方塊 ID {#text-layout-box-ids}

| 版面配置 | 可用的方塊 ID |
|--------|-------------------|
| `top-bottom` | `top`、`bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`、`right` |

## 範例請求 {#example-request}

具有頂部與底部文字的自訂圖片：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

使用內建範本（JSON 主體，不需上傳檔案）：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## 注意事項 {#notes}

- 必須提供 `templateId` 或上傳的圖片檔案。若同時提供兩者，則使用範本。
- 範本會定義自己的文字方塊位置；使用範本時會忽略 `textLayout` 參數。
- 文字會以帶有描邊外框的 SVG 呈現，營造經典迷因外觀。
- 若未明確設定字型大小，會自動計算以符合文字方塊。
- 空白的文字方塊會被略過（若所有方塊皆為空，則不會進行任何呈現）。
- 使用範本時，輸出檔名會包含範本 ID（例如 `meme-drake.png`）。
- HEIC、RAW、PSD 與 SVG 輸入會在處理前自動解碼。
