---
description: "1 つのエディターまたは API を通じて、PDF のページを並べ替え、回転、削除し、他の PDF からページを取り込みます。"
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: a9e12898d374
i18n_hash_version: 2
---

# PDF マルチツール {#multi-tool-pdf}

明示的なページ計画から PDF を組み立てます。ページの並べ替え、複製、回転、削除、および追加の PDF からのページ取り込みを、1 回のリクエストで行います。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

1 つ以上の PDF ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。
1 リクエストあたり、最大 20 の入力ドキュメントと 1,200 の出力ページをサポートします。

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | 説明 |
|-----------|------|----------|-------------|
| items | array | はい | 出力順に並んだ出力ページ計画。各項目は `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }` です。`doc` はアップロード順（0 始まり）でアップロードファイルをインデックスします。`page` はそのドキュメント内の 1 始まりのページ番号です。 |
| pageCounts | array | はい | 各アップロードドキュメントの実際のページ数（同じ順序）。計画ページがそのドキュメントのページ数を超える場合、400 で拒否されます。 |

## リクエスト例 {#example-request}

最初のドキュメントの 3 ページ目と 1 ページ目、続いて 2 番目のドキュメントの 1 ページ目と 2 ページ目を取り出し、最初の出力ページを時計回りに 90° 回転します:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## 注意事項 {#notes}

- 同じページを `items` に複数回含めて複製できます。
- `items` に含まれないページは出力から省略されます。
- `rot` はコピーされたページに新しい表示方向を記録します（既存の回転と合成されます）。ページ内容は変更されません。
- 回転は出力コピーごとに適用されるため、複製ごとに異なる回転を設定できます。
- 出力は新しいフラットなドキュメントです。ソースのブックマークとドキュメントレベルのメタデータは保持されません。
- 処理には qpdf バイナリが必要です。公式 Docker イメージに含まれています。
