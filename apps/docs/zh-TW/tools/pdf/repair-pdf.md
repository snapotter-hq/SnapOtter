---
description: "嘗試修復損毀或毀壞的 PDF。"
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: 65cbb3501cd8
---

# 修復 PDF {#repair-pdf}

透過重建 PDF 的內部結構，嘗試修復損毀或毀壞的 PDF。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

接受包含 PDF 檔案的 multipart 表單資料。不需要 `settings` 欄位。

## 參數 {#parameters}

此工具沒有設定參數。直接上傳損毀的 PDF 檔案即可。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## 注意事項 {#notes}

- 輸入時會略過結構驗證，以便讓格式錯誤的檔案通過。
- 修復為盡力而為；嚴重毀壞的檔案可能無法完全復原。
- 由於重建了交叉參照表，修復後的 PDF 大小可能與原始檔案略有不同。
