---
description: "Word、Markdown、HTML、またはプレーンテキストファイルを EPUB に変換します。"
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: aa0fde2c528f
---

# Convert to EPUB {#convert-to-epub}

Word ドキュメント、Markdown、HTML、またはプレーンテキストファイルを EPUB 電子書籍形式に変換します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Word/Markdown/HTML/TXT ファイルを含むマルチパートフォームデータを受け付けます。

## Parameters {#parameters}

このツールに設定可能なパラメータはありません。ドキュメントをアップロードすると EPUB に変換されます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
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

- 受け付ける入力形式: `.docx`、`.md`、`.html`、`.txt`。
- EPUB 出力は EPUB 3 仕様に準拠します。
- ソースドキュメント内の見出しが目次の生成に使用されます。
- 変換はサーバー上の Pandoc によって処理されます。
