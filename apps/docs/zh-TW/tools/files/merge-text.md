---
description: "依你選擇的順序，將多個文字或 Markdown 檔案合併為一個。"
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: 6ef1398b4f50
i18n_hash_version: 2
---

# 合併文字檔案 {#merge-text}

將多個文字或 Markdown 檔案合併為單一檔案。檔案會依上傳順序串接，因此若順序很重要，請在執行前於檔案清單中調整。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

接受包含兩個或更多文字檔案以及選用 `settings` JSON 字串的 multipart 表單資料。

## Parameters {#parameters}

| 參數 | 類型 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | 檔案之間插入的內容：`"blank-line"`、`"rule"`（一行 `---`）或 `"filename-heading"`（以各檔名作為標題） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Notes {#notes}

- 接受 `.txt`、`.md`、`.markdown`、`.csv` 和 `.log` 檔案，每個請求 2 到 50 個。
- 每個檔案都必須是 UTF-8 文字。二進位檔案或非 UTF-8 檔案會被拒絕，錯誤訊息中會包含其檔名。
- 當所有輸入的副檔名相同時，輸出會保留該副檔名（`merged.md`、`merged.log`）。混合輸入則產生 `merged.txt`。
- 使用 `filename-heading` 時，Markdown 輸出使用 `# name.md` 標題；純文字輸出使用 `==> name.txt <==` 標記行。
- 每個檔案結尾的空白行會被裁掉，讓分隔符乾淨地位於文件之間。開頭的位元組順序標記會被丟棄。
- CSV 檔案會以純文字串接。若要合併表格並只保留一列標頭，請使用 [Merge CSVs](./merge-csvs)。
- 目前尚不支援 `.eml` 郵件檔案。
