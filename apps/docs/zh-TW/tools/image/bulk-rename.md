---
description: "使用模式範本重新命名多個檔案並以 ZIP 下載。"
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: 767ee191db72
---

# Bulk Rename {#bulk-rename}

使用帶有索引、補零索引及原始檔名預留位置的模式範本重新命名多個檔案。回傳包含所有已重新命名檔案的 ZIP 壓縮檔。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

接受包含多個檔案及 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pattern | string | No | `"image-{{index}}"` | 帶有預留位置的命名模式（最多 1000 個字元） |
| startIndex | number | No | `1` | 起始索引編號 |

### Pattern Placeholders {#pattern-placeholders}

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{index}}` | 從 `startIndex` 開始的序號 | `1`、`2`、`3` |
| `{{padded}}` | 補零的序號 | `01`、`02`、`03` |
| `{{original}}` | 不含副檔名的原始檔名 | `photo`、`IMG_001` |

原始檔案副檔名一律會保留。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

這會產生：`vacation-1.jpg`、`vacation-2.jpg`、`vacation-3.jpg`

使用原始檔名：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

這會產生：`2024-trip-IMG_001-1.jpg`、`2024-trip-IMG_002-2.jpg`

## Example Response {#example-response}

回應是直接串流的 ZIP 檔案（而非 JSON 回應）。回應標頭為：

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Notes {#notes}

- 此工具不會處理影像。它只會重新命名檔案並將其打包成 ZIP 壓縮檔。
- `{{padded}}` 的補零寬度會根據檔案總數自動決定（例如 100 個檔案會使用 3 位數補零：`001`、`002` 等）。
- 檔案副檔名會從原始檔名保留。
- 檔名會經過清理以移除不安全的字元。
- 至少必須提供一個檔案。
