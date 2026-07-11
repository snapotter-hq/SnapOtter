---
description: "スプレッドシートを PDF に変換します。"
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: 38b310ffa62a
---

# Excel to PDF {#excel-to-pdf}

Excel、OpenDocument、または CSV のスプレッドシートを PDF に変換します。横に広いシートは複数ページにわたって分割されることがあります。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Excel／ODS／CSV ファイルを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

このツールには設定可能なパラメータはありません。スプレッドシートをアップロードすると PDF に変換されます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
```

## Example Response {#example-response}

`202 Accepted` を返します。`/api/v1/jobs/{jobId}/progress` の SSE で進捗を追跡します。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 受け付ける入力形式: `.xlsx`、`.xls`、`.ods`、`.csv`。
- 横に広いシートは、生成される PDF で複数ページに分割されることがあります。
- グラフや条件付き書式は PDF 出力に描画されます。
- 変換はサーバー上でヘッドレスで動作する LibreOffice によって処理されます。
