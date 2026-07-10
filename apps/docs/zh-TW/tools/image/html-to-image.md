---
description: "以裝置模擬將網頁或 HTML 片段擷取為高品質圖片。"
i18n_source_hash: 1e49d070ea2e
i18n_provenance: human
i18n_output_hash: f4ff7ecb366e
---

# HTML 轉圖片 {#html-to-image}

將網頁 URL 或原始 HTML 內容擷取為截圖。支援裝置模擬（桌面、平板、行動裝置）、整頁擷取與多種輸出格式。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

接受 **JSON 主體**（非 multipart）。不需上傳檔案。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| url | string | 視情況 | - | 要擷取的 URL（必須為有效 URL） |
| html | string | 視情況 | - | 要算繪的原始 HTML 內容（1 到 5,000,000 個字元） |
| format | string | 否 | `"png"` | 輸出格式：`jpg`、`png`、`webp` |
| quality | number | 否 | `90` | 有損格式的輸出品質（1 到 100） |
| fullPage | boolean | 否 | `false` | 擷取整個可捲動頁面，而不僅是可視區域 |
| devicePreset | string | 否 | `"desktop"` | 裝置模擬：`desktop`、`tablet`、`mobile`、`custom` |
| viewportWidth | number | 否 | `1280` | 自訂可視區域寬度（像素，320 到 3840，當 devicePreset 為 `custom` 時使用） |
| viewportHeight | number | 否 | `720` | 自訂可視區域高度（像素，320 到 2160，當 devicePreset 為 `custom` 時使用） |

必須提供 `url` 或 `html` 其中之一，但不能同時提供兩者。

### 裝置預設 {#device-presets}

| 預設 | 寬度 | 高度 | 行動 UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | 否 |
| `tablet` | 768 | 1024 | 否 |
| `mobile` | 375 | 812 | 是 |
| `custom` | （使用者指定） | （使用者指定） | 否 |

## 範例請求 {#example-request}

擷取網頁：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

算繪 HTML 內容：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

## 注意事項 {#notes}

- 需要伺服器上安裝 Chromium。若瀏覽器服務無法使用，會回傳 HTTP 503。
- URL 會針對 SSRF 攻擊進行驗證（私有/內部網路位址會被封鎖）。
- 此端點的速率限制為每小時 120 個請求。
- `originalSize` 一律為 0，因為此工具是從 URL/HTML 產生圖片。
- 輸出檔名為 `screenshot.<format>`。
- 若頁面載入耗時過久，請求會回傳 HTTP 504（閘道逾時）。
- 若瀏覽器服務反覆當機，會被暫時停用並回傳 HTTP 503，錯誤碼為 `BROWSER_CRASHED`。
