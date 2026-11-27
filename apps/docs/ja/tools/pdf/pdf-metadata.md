---
description: "PDF ドキュメントのメタデータを読み書きします。"
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: bb094c6ecb42
i18n_hash_version: 2
---

# PDF Metadata {#pdf-metadata}

タイトル、作成者、サブジェクト、キーワードなどの PDF ドキュメントのメタデータフィールドを読み取り・更新するか、ドキュメントのメタデータをすべて削除します。設定が指定されない場合、既存のメタデータが変更されずに返されます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

PDF ファイルと、任意の JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | ドキュメントのタイトル（最大 500 文字） |
| author | string | No | - | ドキュメントの作成者（最大 500 文字） |
| subject | string | No | - | ドキュメントのサブジェクト（最大 500 文字） |
| keywords | string | No | - | ドキュメントのキーワード（最大 500 文字） |
| stripAll | boolean | No | false | Info 辞書全体（日付、Creator、Producer、カスタムキー）、すべての XMP ストリーム（ドキュメント、ページ、画像）、およびすべての PieceInfo アプリケーションデータを削除し、その後、上記で指定されたフィールドを書き込みます |
| removeAttachments | boolean | No | false | 埋め込みファイルも削除します: ドキュメントの添付ファイル一覧、ファイル添付注釈、関連ファイル（`/AF`）が対象です。`stripAll` が必要です |

すべてのパラメータは任意です。省略したフィールドは、`stripAll` が設定されていない限り変更されません。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- 受け付ける入力形式: `.pdf`。
- これは結果を直接返す高速（同期）ツールです。
- レスポンスの `metadata` フィールドには、更新後の結果メタデータが含まれます。
- メタデータを変更せずに読み取るには、`settings` フィールドを省略するか空のオブジェクトを送信してください。
- 各メタデータフィールドは 500 文字までに制限されています。
- `stripAll` を指定すると、レスポンスに `stripped` も含まれます。内容は、削除された Info キー（`removed`）、ドキュメントの XMP ストリームが削除されたかどうか（`xmpRemoved`）、入力が宣言していた PDF/A レベル（`pdfa`、または `null`）、ページ、画像、その他のオブジェクトから取り除かれた XMP ストリームの数（`objectXmpRemoved`）、削除された PieceInfo 辞書の数（`pieceInfoRemoved`）、削除された埋め込みファイルの数（`attachmentsRemoved`、`removeAttachments` なしでは常に `0`）です。XMP を削除すると PDF/A への適合性が失われます。
- `stripAll` だけでは埋め込みファイルの添付は保持されます。削除するとドキュメントの内容が変わるためです。これらも削除するには `removeAttachments` を追加してください。その場合、ZUGFeRD や Factur-X の電子インボイスに添付された XML も削除され、PDF/A-3 への適合性が失われます。
- `stripAll` なしで `removeAttachments` を送信すると 400 を返します。
