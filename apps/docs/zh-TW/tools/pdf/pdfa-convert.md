---
description: "將 PDF 轉換為封存用的 PDF/A-2 格式以供長期保存。"
i18n_source_hash: 4c6bf7a12e84
i18n_provenance: human
i18n_output_hash: 3dbdd411b552
---

# PDF/A 轉換 {#pdf-a-convert}

將 PDF 轉換為 PDF/A-2 封存格式，適用於長期保存與法規遵循。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

接受包含 PDF 檔案的 multipart 表單資料。不需要 `settings` 欄位。

## 參數 {#parameters}

此工具沒有設定參數。直接上傳 PDF 檔案即可。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## 注意事項 {#notes}

- 輸出符合 PDF/A-2 標準。
- PDF/A 會內嵌所有字型並禁止外部參照，因此輸出檔案可能比原始檔案大。
- 加密與 JavaScript 會在轉換過程中被移除，因為 PDF/A 標準不允許它們。
