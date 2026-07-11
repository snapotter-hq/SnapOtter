---
description: "將 PDF 轉換為 Word 文件（DOCX）。"
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: 1fc792f809a2
---

# PDF 轉 Word {#pdf-to-word}

將以文字為主的 PDF 轉換為 Word 文件（DOCX）。最適合具有可選取文字的 PDF；掃描頁面需要先進行 OCR。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

接受包含 PDF 檔案的 multipart 表單資料。

## 參數 {#parameters}

此工具沒有可設定的參數。上傳 PDF 後即會將其轉換為 DOCX。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## 範例回應 {#example-response}

回傳 `202 Accepted`。透過 SSE 於 `/api/v1/jobs/{jobId}/progress` 追蹤進度。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## 注意事項 {#notes}

- 接受的輸入格式：`.pdf`。
- 最適合用於以文字為主的 PDF。掃描或純影像的頁面會產生空白或極少的輸出；請先使用 [PDF OCR](./ocr-pdf) 加入文字圖層。
- 轉換由伺服器上以無頭模式執行的 LibreOffice 處理。
- 複雜的版面配置（多欄、重疊元素）可能無法完美轉換。
