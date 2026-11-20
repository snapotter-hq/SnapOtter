---
description: "將 PDF 轉換為 Markdown，並保留 PDF 中的標題、清單與表格。"
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 8d9d6be7daca
i18n_hash_version: 2
---

# PDF 轉 Markdown {#pdf-to-markdown}

將 PDF 轉成 Markdown 檔案，可直接放進 wiki、靜態網站或 LLM 管線。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

接受包含 PDF 檔案的 multipart 表單資料。

## 參數 {#parameters}

此工具沒有可設定的參數。上傳 PDF 後即可取得 `.md` 檔案。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

較大的 PDF 可能超出同步等待時間。此時 API 會回應 `202` 與 `jobId`，你可以透過 `/api/v1/jobs/{jobId}/progress` 追蹤進度。

## 保留的內容 {#what-gets-kept}

PDF 儲存的是有位置的文字，而非結構，因此轉換器必須自行推斷：

- **標題。** 明顯比內文大的短行會成為 `#` 到 `######` 標題，依整份文件中的字級排序。
- **清單。** 以項目符號或數字開頭的行會成為清單項目。
- **粗體、斜體與連結。** 以行內形式保留。只有 `http`、`https` 與 `mailto` 連結會保留。
- **表格。** 以框線繪製的表格會輸出為 Markdown 表格。只靠空白排版的表格通常會變成一般段落。

圖片會被捨棄。多欄版面與特殊的頁面設計只能盡力處理，使用前請檢查輸出。

## 備註 {#notes}

- 接受的輸入格式：`.pdf`。
- 回應中的 `chars` 欄位是 Markdown 輸出的長度。
- 掃描 PDF 沒有可轉換的文字圖層。工具會以 `422` 與錯誤碼 `NO_TEXT_LAYER` 拒絕，而不是回傳空檔案。請改用 [PDF OCR](./ocr-pdf) 工具。
- 若要往返轉換，[Markdown 轉 PDF](../files/markdown-to-pdf)、[Markdown 轉 Word](../files/markdown-to-docx) 與 [Markdown 轉 HTML](../files/markdown-to-html) 可讀取 `.md` 檔案。
