---
description: "根据 CSV 或 JSON 数据创建柱状图、折线图或饼图。"
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: f386d98f072b
---

# Chart Maker {#chart-maker}

根据 CSV 或 JSON 数据创建柱状图、折线图或饼图。返回渲染图表的 PNG 图片。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

接受包含 CSV 或 JSON 文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| kind | string | No | `"bar"` | 图表类型：`bar`、`line`、`pie` |
| title | string | No | - | 图表标题（最多 120 个字符） |
| width | integer | No | `960` | 图表宽度（单位像素，320-2048） |
| height | integer | No | `540` | 图表高度（单位像素，240-1536） |

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

- 输入必须是 `.csv` 或 `.json` 文件。CSV 文件应带有包含列名的表头行。
- 第一列用作类别标签；第二列必须为数值，用于提供数据值。只使用两列。
- JSON 输入应为一组 `{label, value}` 对象，或一个普通对象，其键成为标签、值成为数据点。
- 最多 100 个数据点。所有值必须大于或等于零。
- 无论输入格式如何，输出始终是 PNG 图片。
