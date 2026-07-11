---
description: "讀取並寫入 PDF 文件的中繼資料。"
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: d57983de0478
---

# PDF 中繼資料 {#pdf-metadata}

讀取並更新 PDF 文件的中繼資料欄位，例如標題、作者、主旨與關鍵字。若未提供任何設定，則會回傳現有的中繼資料而不做修改。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

接受包含 PDF 檔案與選填 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| title | string | 否 | - | 文件標題（最多 500 個字元） |
| author | string | 否 | - | 文件作者（最多 500 個字元） |
| subject | string | 否 | - | 文件主旨（最多 500 個字元） |
| keywords | string | 否 | - | 文件關鍵字（最多 500 個字元） |

所有參數皆為選填。省略的欄位會維持不變。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## 注意事項 {#notes}

- 接受的輸入格式：`.pdf`。
- 這是一個快速（同步）工具，會直接回傳結果。
- 回應中的 `metadata` 欄位包含任何更新後所產生的中繼資料。
- 若要在不修改的情況下讀取中繼資料，請省略 `settings` 欄位或傳送一個空物件。
- 每個中繼資料欄位上限為 500 個字元。
