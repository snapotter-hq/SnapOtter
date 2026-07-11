---
description: "在 PDF 的每一頁加上頁碼。"
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 42ef40134b60
---

# PDF 頁碼 {#pdf-page-numbers}

在 PDF 的每一頁加上「第 N 頁，共 M 頁」的頁碼。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| position | string | 否 | `"bc"` | 頁碼放置位置：`bl`、`bc`、`br`、`tl`、`tc`、`tr` |
| fontSize | integer | 否 | `10` | 以點為單位的字型大小（6-24） |

### 位置值 {#position-values}

- `tl` 左上、`tc` 上方置中、`tr` 右上
- `bl` 左下、`bc` 下方置中、`br` 右下

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## 注意事項 {#notes}

- 頁碼會以「第 1 頁，共 10 頁」的格式渲染。
- 頁碼會加到每一頁，包括任何現有的標題頁或封面頁。
- 預設位置 `"bc"` 會將頁碼放在每一頁的下方置中。
