---
description: "透過壓縮內嵌影像來縮小 PDF 檔案大小。"
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 429b2e896a58
---

# 壓縮 PDF {#compress-pdf}

透過降低內嵌影像的取樣率來縮小 PDF 檔案大小。可選擇使用品質滑桿或指定目標檔案大小。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| mode | string | 否 | `"quality"` | 壓縮模式：`quality` 或 `targetSize` |
| quality | integer | 否 | `75` | 壓縮品質，1-100（越高 = 壓縮越少）。用於 `quality` 模式 |
| targetSizeKb | number | 否 | - | 以 KB 為單位的目標檔案大小。用於 `targetSize` 模式 |

## 範例請求 {#example-request}

依品質壓縮：

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

壓縮至目標大小：

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## 注意事項 {#notes}

- 在 `quality` 模式下，數值越低產生的檔案越小，但影像劣化越明顯。
- 在 `targetSize` 模式下，二元搜尋會找出符合所要求大小的最高 DPI。
- 若壓縮反而會使檔案變大，則會原封不動地回傳原始位元組。
- 文字與向量內容不受影響；只有內嵌的點陣影像會被降低取樣率。
