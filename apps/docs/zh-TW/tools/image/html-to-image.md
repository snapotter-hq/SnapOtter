---
description: "以裝置模擬將網頁或 HTML 片段擷取為高品質圖片。"
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: 176d588f7246
i18n_hash_version: 2
---

# HTML 轉圖片 {#html-to-image}

將網頁 URL 或原始 HTML 內容擷取為截圖。支援裝置模擬(桌面、平板、行動裝置)、整頁擷取與多種輸出格式。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

接受 **JSON 主體**(非 multipart)。不需上傳檔案。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| url | string | 視情況 | - | 要擷取的 URL(必須為有效 URL) |
| html | string | 視情況 | - | 要算繪的原始 HTML 內容(1 到 5,000,000 個字元) |
| format | string | 否 | `"png"` | 輸出格式:`jpg`、`png`、`webp` |
| quality | number | 否 | `90` | 有損格式的輸出品質(1 到 100) |
| fullPage | boolean | 否 | `false` | 擷取整個可捲動頁面,而不僅是可視區域 |
| devicePreset | string | 否 | `"desktop"` | 裝置模擬:`desktop`、`tablet`、`mobile`、`custom` |
| viewportWidth | number | 否 | `1280` | 自訂可視區域寬度(像素,320 到 3840,當 devicePreset 為 `custom` 時使用) |
| viewportHeight | number | 否 | `720` | 自訂可視區域高度(像素,320 到 2160,當 devicePreset 為 `custom` 時使用) |
| clientJobId | string | 否 | - | 你自己的作業 ID,讓你能在回應送達前先開啟進度串流 |

必須提供 `url` 或 `html` 其中之一,但不能同時提供兩者。

### 裝置預設 {#device-presets}

| 預設 | 寬度 | 高度 | 行動 UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | 否 |
| `tablet` | 768 | 1024 | 否 |
| `mobile` | 375 | 812 | 是 |
| `custom` | (使用者指定) | (使用者指定) | 否 |

## 範例請求 {#example-request}

擷取網頁:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

算繪 HTML 內容:

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

### 較慢的頁面 {#slow-pages}

擷取會以排入佇列的作業執行。若擷取在同步等待時間內完成,會以 `200` 回應上述結果。較慢的擷取則會以 `202` 回應並附上作業 ID:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

請追蹤 `progressUrl`(Server-Sent Events)直到作業完成。完成事件所帶的結果物件,與 `200` 回應相同。你可以用 `POST /api/v1/jobs/{jobId}/cancel` 取消作業。

::: warning 2.3.0 之後的變更
在 2.3.0 以前,此端點一律會保持請求開啟直到擷取完成,並回應 `200`。只處理 `200` 的指令碼也應該處理 `202`。
:::

## 注意事項 {#notes}

- 需要伺服器上安裝 Chromium。若瀏覽器服務無法使用,會回傳 HTTP 503。
- URL 會針對 SSRF 攻擊進行驗證(私有/內部網路位址會被封鎖)。
- 此端點的速率限制為每小時 120 個請求。
- `originalSize` 一律為 0,因為此工具是從 URL/HTML 產生圖片。
- 輸出檔名為 `screenshot.<format>`。
- 若頁面載入耗時過久,擷取會失敗並回傳 HTTP 504(閘道逾時)。
- 若瀏覽器服務反覆當機,會被暫時停用,擷取會失敗並回傳 HTTP 503,錯誤碼為 `BROWSER_CRASHED`。
- 與其他排入佇列的圖片作業一樣,瀏覽器當機(HTTP 503)會先重試一次,才回報失敗。頁面載入逾時則不會重試。
- 已經回應 `202` 的擷取,會改在其進度串流上回報失敗,而不是透過 HTTP 狀態碼。
