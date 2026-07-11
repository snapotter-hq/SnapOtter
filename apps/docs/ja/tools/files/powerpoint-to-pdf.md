---
description: "プレゼンテーションを PDF に変換します。"
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: c57d81319497
---

# PowerPoint to PDF {#powerpoint-to-pdf}

PowerPoint または OpenDocument のプレゼンテーションを、1 スライド 1 ページで PDF に変換します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

PowerPoint/ODP ファイルを含むマルチパートフォームデータを受け付けます。

## Parameters {#parameters}

このツールに設定可能なパラメータはありません。プレゼンテーションをアップロードすると PDF に変換されます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Example Response {#example-response}

`202 Accepted` を返します。進捗は `/api/v1/jobs/{jobId}/progress` の SSE で追跡できます。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 受け付ける入力形式: `.pptx`、`.ppt`、`.odp`。
- 各スライドが PDF の 1 ページになります。
- 変換はサーバー上でヘッドレス実行される LibreOffice によって処理されます。
- アニメーションやトランジションは PDF 出力に含まれません。
