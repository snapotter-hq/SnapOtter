---
description: "將多個 PDF 合併成單一文件。"
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: 9f0143772741
---

# 合併 PDF {#merge-pdfs}

將兩個或多個 PDF 檔案合併成單一文件，並保留每個輸入檔案的頁面順序。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

接受包含兩個或多個 PDF 檔案的 multipart 表單資料。不需要 `settings` 欄位。

## 參數 {#parameters}

此工具沒有設定參數。只需上傳兩個或多個 PDF 檔案即可。

| 限制 | 值 |
|------------|-------|
| 最少檔案數 | 2 |
| 最多檔案數 | 20 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## 注意事項 {#notes}

- 檔案會依上傳的順序合併。
- 至少需要兩個 PDF 檔案；若提供的檔案少於此數量，請求會以 400 錯誤失敗。
- 輸入檔案的最大數量為 20 個。
- 加密的 PDF 必須先解鎖才能合併。
