---
description: "移除 PDF 的密碼保護。"
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 3ad23d020d21
---

# 解鎖 PDF {#unlock-pdf}

透過提供正確的密碼來移除加密 PDF 的密碼保護。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| password | string | 是 | - | 用於解密 PDF 的密碼（1-256 個字元） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## 注意事項 {#notes}

- 必須提供正確的密碼；密碼不正確會回傳 400 錯誤。
- 使用者密碼或擁有者密碼皆可用於解密。
- 密碼會從稽核日誌中遮蔽。
