---
description: "產生具有自訂顏色與錯誤更正等級的 QR code。"
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: 2a8e4a1e4f06
---

# QR Code 產生器 {#qr-code-generator}

從文字或 URL 產生 QR code 圖片，可設定大小、錯誤更正等級與自訂前景／背景顏色。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

接受 **JSON 主體**（非 multipart）。不需上傳檔案。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| text | string | 是 | - | 要編碼至 QR code 的內容（1 至 2000 個字元） |
| size | number | 否 | `400` | 輸出圖片寬度／高度（像素，100 至 10000） |
| errorCorrection | string | 否 | `"M"` | 錯誤更正等級：`L`（7%）、`M`（15%）、`Q`（25%）、`H`（30%） |
| foreground | string | 否 | `"#000000"` | QR code 前景／模組顏色的十六進位值（`#RRGGBB`） |
| background | string | 否 | `"#FFFFFF"` | QR code 背景顏色的十六進位值（`#RRGGBB`） |
| logoDataUri | string | 否 | - | 以 data URI 形式提供的標誌圖片（`data:image/png;base64,...` 或 `data:image/jpeg;base64,...`，最大 700 KB）。置中於 QR code 上，佔 QR 大小的 22%。會強制將錯誤更正設為 `H` |

### 錯誤更正等級 {#error-correction-levels}

| 等級 | 復原能力 | 使用情境 |
|-------|----------|----------|
| `L` | 約 7% | 最大資料密度 |
| `M` | 約 15% | 平衡（預設） |
| `Q` | 約 25% | 適合列印的 code |
| `H` | 約 30% | 最適合帶有標誌覆蓋的 code |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

具有自訂顏色的品牌化 QR code：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## 注意事項 {#notes}

- 此端點接受 JSON，而非 multipart 表單資料，因為不需上傳圖片。
- 輸出一律為 PNG 圖片。
- 輸出檔名一律為 `qrcode.png`。
- `originalSize` 一律為 0，因為此工具是從零開始產生圖片。
- QR code 周圍會包含 2 個模組的靜區（邊界）。
- 文字長度上限為 2000 個字元。實際容量取決於錯誤更正等級與字元編碼。
- 較高的錯誤更正等級可讓 QR code 即使部分被遮蔽仍可掃描，但會降低資料容量。
- 當提供 `logoDataUri` 時，錯誤更正會自動強制設為 `H`（30%），使 QR code 即使中央被標誌遮擋仍可掃描。
