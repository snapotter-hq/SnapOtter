---
description: "從 PDF 中擷取純文字。"
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: bb843dad4b9a
---

# PDF 轉文字 {#pdf-to-text}

將 PDF 文件中所有可讀取的純文字擷取到一個文字檔中。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

接受包含 PDF 檔案的 multipart 表單資料。

## 參數 {#parameters}

此工具沒有可設定的參數。上傳 PDF 後即會擷取其文字內容。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## 注意事項 {#notes}

- 接受的輸入格式：`.pdf`。
- 這是一個快速（同步）工具，會直接回傳結果。
- 回應中的 `chars` 欄位表示所擷取的字元數。
- 只會擷取以數位形式內嵌的文字。對於掃描文件或以影像為主的 PDF，請改用 [PDF OCR](./ocr-pdf) 工具。
