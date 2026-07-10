---
description: "Word ドキュメントを PDF に変換します。"
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: fa2981cd461d
---

# Word to PDF {#word-to-pdf}

Word ドキュメント、OpenDocument テキスト、RTF、またはプレーンテキストファイルを PDF に変換します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Word/ODT/RTF/TXT ファイルを含むマルチパートフォームデータを受け付けます。

## Parameters {#parameters}

このツールに設定可能なパラメータはありません。ドキュメントをアップロードすると PDF に変換されます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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

- 受け付ける入力形式: `.docx`、`.doc`、`.odt`、`.rtf`、`.txt`。
- 変換はサーバー上でヘッドレス実行される LibreOffice によって処理されます。
- 利用可能な場合はドキュメントに埋め込まれたフォントが使用され、そうでない場合はシステムフォントに置き換えられます。
- ヘッダー、フッター、テーブル、画像は PDF 出力で保持されます。
