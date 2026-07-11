---
description: "使用感知雜湊偵測重複與近似重複的圖片。"
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 7bc4436376b3
---

# 尋找重複項 {#find-duplicates}

上傳多張圖片，使用感知雜湊（dHash）偵測重複與近似重複的圖片。會將相似的圖片分組、找出每組中品質最佳的版本，並計算可節省的潛在空間。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

接受包含多個圖片檔案的 multipart 表單資料，以及一個選填的 JSON `settings` 欄位。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| threshold | number | 否 | `8` | 判定圖片為重複所允許的最大漢明距離（0 到 20）。數值越低，比對越嚴格 |

### 檔案欄位 {#file-fields}

在 multipart 請求中至少上傳 2 個圖片檔案（皆使用 `file` 欄位名稱，或檔案部分使用任意欄位名稱）。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## 範例回應 {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## 回應欄位 {#response-fields}

| 欄位 | 型別 | 說明 |
|-------|------|-------------|
| totalImages | number | 成功分析的圖片數量 |
| duplicateGroups | array | 重複圖片的分組 |
| uniqueImages | number | 不屬於任何重複分組的圖片數量 |
| spaceSaveable | number | 移除非最佳重複項後可節省的總位元組數 |
| skippedFiles | array | 無法處理的檔案（含檔名與原因） |

### 重複分組物件 {#duplicate-group-object}

| 欄位 | 型別 | 說明 |
|-------|------|-------------|
| groupId | number | 分組識別碼 |
| files | array | 此重複分組中的圖片 |

### 檔案物件（分組內） {#file-object-within-a-group}

| 欄位 | 型別 | 說明 |
|-------|------|-------------|
| filename | string | 原始檔名 |
| similarity | number | 與參考圖片（分組中第一張）的相似度百分比 |
| width | number | 圖片寬度（像素） |
| height | number | 圖片高度（像素） |
| fileSize | number | 檔案大小（位元組） |
| format | string | 圖片格式 |
| isBest | boolean | 是否為品質最高的版本（像素最多、檔案最大） |
| thumbnail | string 或 null | Base64 JPEG 縮圖（寬 200px），供預覽用 |

## 注意事項 {#notes}

- 使用 128 位元 dHash（64 位元列 + 64 位元欄）進行感知相似度偵測。即使經過縮放、重新壓縮與細微編輯，也能偵測出重複項。
- threshold 代表雜湊之間的最大漢明距離。預設值 8 可偵測近似重複項，同時避免誤判。使用 0 只比對像素完全相同者，或使用 15-20 進行非常寬鬆的比對。
- 每組中的「最佳」圖片是像素最多者（寬 x 高），並以檔案大小作為決勝條件。
- 至少需要 2 張圖片。驗證或解碼失敗的檔案會回報於 `skippedFiles` 中，而不會導致整個請求失敗。
- 縮圖是寬 200px 的 JPEG 預覽，編碼為 data URI。
- 支援所有常見格式（HEIC、RAW、PSD、SVG 會自動解碼）。
