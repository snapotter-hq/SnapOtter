---
description: "依品質層級或目標檔案大小縮減圖片檔案大小。"
i18n_source_hash: af4685da7e64
i18n_provenance: human
i18n_output_hash: 87b36988f2d2
---

# 壓縮 {#compress}

透過指定品質層級或以 KB 為單位的目標檔案大小來縮減圖片檔案大小。此工具使用迭代式二元搜尋以精準達到大小目標。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/compress`

接受包含圖片檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| mode | string | 否 | `"quality"` | 壓縮模式：`quality` 或 `targetSize` |
| quality | number | 否 | `80` | 品質層級（1-100）。當模式為 `quality` 時使用。 |
| targetSizeKb | number | 否 | - | 以 KB 為單位的目標檔案大小。當模式為 `targetSize` 時使用。 |

## 範例請求 {#example-request}

壓縮至品質 60：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

壓縮至目標大小 200 KB：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## 備註 {#notes}

- 在 `quality` 模式下，數值越低，檔案越小，但壓縮失真也越多。值為 80 是網頁使用的良好預設。
- 在 `targetSize` 模式下，引擎會執行迭代壓縮，在不超過目標的前提下盡可能逼近目標。
- 輸出格式與輸入格式相符。壓縮套用於該格式的原生編碼（例如 JPEG 檔案用 JPEG 品質，WebP 檔案用 WebP 品質）。
- 若預設品質（80）可接受，可完全省略 `quality` 參數。
