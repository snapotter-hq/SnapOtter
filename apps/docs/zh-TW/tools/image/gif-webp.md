---
description: "在動態 GIF 與 WebP 之間互相轉換，並保留所有影格。"
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: 7fedb3b49b7b
---

# GIF/WebP 轉換器 {#gif-webp-converter}

在動態 GIF 檔案與 WebP 之間互相轉換，保留所有影格與動畫時序。WebP 動畫通常比同等的 GIF 小 25-35%。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

接受包含一個 GIF 或 WebP 檔案的 multipart 表單資料，以及一個 JSON `settings` 欄位。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| quality | integer | 否 | `80` | WebP 編碼的輸出品質（1-100） |
| lossless | boolean | 否 | `false` | 使用無損 WebP 壓縮 |
| resizePercent | integer | 否 | `100` | 依百分比縮放輸出（10-100） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## 注意事項 {#notes}

- 僅接受 `.gif` 與 `.webp` 檔案。此工具不支援其他圖片格式。
- 轉換方向會自動判定：GIF 輸入產生 WebP 輸出，WebP 輸入產生 GIF 輸出。
- `quality` 與 `lossless` 選項僅在編碼為 WebP 時適用。轉換為 GIF 時，輸出會使用標準的 GIF 調色盤。
- 使用 `resizePercent` 縮小大型動畫的尺寸（與檔案大小）。
