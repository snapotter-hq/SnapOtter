---
description: "將 PDF 中的所有色彩轉換為灰階。"
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 4f6bba34c97e
---

# 灰階 PDF {#grayscale-pdf}

將 PDF 中的所有色彩轉換為灰階，產生文件的黑白版本。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

接受包含 PDF 檔案的 multipart 表單資料。不需要 `settings` 欄位。

## 參數 {#parameters}

此工具沒有設定參數。直接上傳 PDF 檔案即可。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## 注意事項 {#notes}

- 所有色彩空間（RGB、CMYK）都會轉換為灰階，包括內嵌影像、向量圖形與文字。
- 輸出檔案通常比原始檔案小，因為灰階資料每個像素所需的位元組較少。
