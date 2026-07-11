---
description: "PDF を Word ドキュメント（DOCX）に変換します。"
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: ae6b0ba83e16
---

# PDF to Word {#pdf-to-word}

テキストベースの PDF を Word ドキュメント（DOCX）に変換します。選択可能なテキストを含む PDF に最適です。スキャンされたページには先に OCR が必要です。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

PDF ファイルを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

このツールに設定可能なパラメータはありません。PDF をアップロードすると DOCX に変換されます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
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

- 受け付ける入力形式: `.pdf`。
- テキストベースの PDF に最も適しています。スキャンされたページや画像のみのページでは、出力が空または最小限になります。まず [PDF OCR](./ocr-pdf) を使ってテキストレイヤーを追加してください。
- 変換はサーバー上でヘッドレス実行される LibreOffice で処理されます。
- 複雑なレイアウト（複数段組み、要素の重なり）は完全には変換されない場合があります。
