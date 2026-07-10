---
description: "並排比較兩張圖片，提供像素層級的差異視覺化與相似度分數。"
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: 61312e4ff20e
---

# 圖片比較 {#image-compare}

上傳兩張圖片以計算像素層級的差異圖與數值化的相似度百分比。輸出為一張以紅色標示變動區域的差異圖。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/compare`

接受包含**兩個**圖片檔案的 multipart 表單資料。不需要設定欄位。

## 參數 {#parameters}

此工具沒有可設定的參數。請上傳剛好兩個圖片檔案。

| 欄位 | 類型 | 必填 | 說明 |
|-------|------|----------|-------------|
| file（第一個） | file | 是 | 第一張圖片 |
| file（第二個） | file | 是 | 第二張圖片 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## 回應欄位 {#response-fields}

| 欄位 | 類型 | 說明 |
|-------|------|-------------|
| jobId | string | 用於下載差異圖的工作識別碼 |
| similarity | number | 兩張圖片之間的相似度百分比（0 至 100） |
| dimensions | object | 用於比較的寬度與高度 |
| downloadUrl | string | 用於下載所產生差異圖的 URL |
| originalSize | number | 兩張輸入圖片的合計大小（位元組） |
| processedSize | number | 差異輸出圖的大小（位元組） |

## 備註 {#notes}

- 比較前，兩張圖片都會被縮放為相同尺寸（各軸取最大值）。
- 差異圖以紅色標示差異，透明度與變動幅度成正比。相同或近乎相同的像素（差異 < 10）會以原圖的半透明版本呈現。
- 相似度的計算方式為所有像素平均像素差異的倒數，並以百分比表示。
- 相似度 100% 表示兩張圖片在像素層級完全相同（於比較解析度下）。
- 無論輸入格式為何，差異輸出一律為 PNG 格式。
- 兩張圖片在比較前都會經過驗證與解碼（支援 HEIC、RAW、PSD、SVG）。
- 處理前會在兩張圖片上自動套用 EXIF 方向。
