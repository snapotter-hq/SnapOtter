---
description: "從 PDF 中永久移除文字出現處（經驗證的真實塗黑）。"
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: fd38d5f46941
---

# 塗黑 PDF {#redact-pdf}

使用經驗證的真實塗黑，從 PDF 中永久移除指定的文字出現處。被塗黑的文字會從檔案中完全移除，而不僅僅是以黑框覆蓋。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| terms | string[] | 是 | - | 要塗黑的文字字串（1-50 個詞，每個最多 200 個字元） |
| caseSensitive | boolean | 否 | `false` | 比對是否區分大小寫 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## 注意事項 {#notes}

- 接受的輸入格式：`.pdf`。
- 這是一個快速（同步）工具，會直接回傳結果。
- 這會執行真實塗黑：比對到的文字會從 PDF 內容串流中移除，而不僅是在視覺上遮蔽。
- 回應中的 `found` 欄位表示有多少處出現被塗黑。
- 你在單一請求中最多可塗黑 50 個詞。
