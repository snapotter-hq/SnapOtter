---
description: "為 PDF 加上使用 AES-256 加密的密碼保護。"
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 50e623f2bb96
---

# 保護 PDF {#protect-pdf}

使用 AES-256 加密為 PDF 加上密碼保護。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| userPassword | string | 是 | - | 開啟 PDF 所需的密碼（1-256 個字元） |
| ownerPassword | string | 否 | 與 `userPassword` 相同 | 用於權限的擁有者密碼（1-256 個字元） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## 注意事項 {#notes}

- 加密使用 AES-256。
- 若省略 `ownerPassword`，則預設為與 `userPassword` 相同的值。
- 密碼會從稽核日誌中遮蔽。
- 加密後的 PDF 需要使用者密碼才能開啟，並需要擁有者密碼（若不同）才能取得完整權限。
