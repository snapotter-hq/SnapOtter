---
description: "從 CSV 或 JSON 資料建立長條圖、折線圖或圓餅圖。"
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: d800a1d08d7c
---

# 圖表製作 {#chart-maker}

從 CSV 或 JSON 資料建立長條圖、折線圖或圓餅圖。回傳所繪製圖表的 PNG 影像。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

接受包含一個 CSV 或 JSON 檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| kind | string | No | `"bar"` | 圖表類型：`bar`、`line`、`pie` |
| title | string | No | - | 圖表標題（最多 120 個字元） |
| width | integer | No | `960` | 圖表寬度（像素）（320-2048） |
| height | integer | No | `540` | 圖表高度（像素）（240-1536） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Notes {#notes}

- 輸入必須是 `.csv` 或 `.json` 檔案。CSV 檔案應含有帶欄位名稱的標題列。
- 第一欄會作為類別標籤；第二欄必須為數值，用來提供資料值。只會使用兩欄。
- JSON 輸入應為一個 `{label, value}` 物件的陣列，或是一個純物件，其鍵會成為標籤、值會成為資料點。
- 最多 100 個資料點。所有值都必須為零或以上。
- 無論輸入格式為何，輸出一律為 PNG 影像。
