---
description: "將表單與註解烘焙進頁面內容。"
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: c7afc6f555da
---

# 平面化 PDF {#flatten-pdf}

將互動式表單欄位與註解烘焙進頁面內容，產生一份在任何地方看起來都相同的靜態 PDF。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

接受包含 PDF 檔案的 multipart 表單資料。

## 參數 {#parameters}

此工具沒有可設定的參數。上傳 PDF 後，所有表單與註解都會被平面化。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## 注意事項 {#notes}

- 接受的輸入格式：`.pdf`。
- 這是一個快速（同步）工具，會直接回傳結果。
- 表單欄位的值會以靜態文字的形式保留在輸出中。
- 註解（評論、螢光標記、便利貼）會成為頁面內容的一部分，無法再進行編輯。
