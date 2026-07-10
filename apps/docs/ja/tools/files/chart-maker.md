---
description: "CSV または JSON データから棒グラフ、折れ線グラフ、円グラフを作成します。"
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: b6354341fb47
---

# Chart Maker {#chart-maker}

CSV または JSON データから棒グラフ、折れ線グラフ、円グラフを作成します。描画されたグラフの PNG 画像を返します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

CSV または JSON ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| kind | string | No | `"bar"` | グラフの種類: `bar`、`line`、`pie` |
| title | string | No | - | グラフのタイトル（最大 120 文字） |
| width | integer | No | `960` | グラフの幅（ピクセル、320〜2048） |
| height | integer | No | `540` | グラフの高さ（ピクセル、240〜1536） |

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

- 入力は `.csv` または `.json` ファイルである必要があります。CSV ファイルには列名を含むヘッダー行が必要です。
- 最初の列がカテゴリラベルとして使用され、2 番目の列は数値である必要があり、データ値を提供します。使用されるのは 2 列のみです。
- JSON 入力は `{label, value}` オブジェクトの配列、またはキーがラベルに、値がデータポイントになるプレーンオブジェクトである必要があります。
- データポイントは最大 100 個です。すべての値は 0 以上である必要があります。
- 入力形式にかかわらず、出力は常に PNG 画像です。
