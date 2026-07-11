---
description: "將 Word 文件轉換為 PDF。"
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 24dc9904a254
---

# Word to PDF {#word-to-pdf}

將 Word 文件、OpenDocument 文字、RTF 或純文字檔案轉換為 PDF。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

接受包含 Word/ODT/RTF/TXT 檔案的 multipart form data。

## Parameters {#parameters}

此工具沒有可設定的參數。上傳一個文件，它就會被轉換為 PDF。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
```

## Example Response {#example-response}

回傳 `202 Accepted`。可透過 SSE 在 `/api/v1/jobs/{jobId}/progress` 追蹤進度。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 接受的輸入格式：`.docx`、`.doc`、`.odt`、`.rtf`、`.txt`。
- 轉換由伺服器上以無介面模式執行的 LibreOffice 處理。
- 若文件中嵌入了字型則會使用該字型；否則會以系統字型替代。
- 頁首、頁尾、表格與圖片會在 PDF 輸出中保留。
