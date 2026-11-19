---
description: "複数のテキストまたは Markdown ファイルを、選んだ順序で 1 つに結合します。"
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: 402d95f9db4d
i18n_hash_version: 2
---

# テキストファイル結合 {#merge-text}

複数のテキストまたは Markdown ファイルを 1 つのファイルに結合します。ファイルはアップロードした順に連結されるため、順序が重要な場合は実行前にファイルリストで並べ替えてください。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

2 つ以上のテキストファイルと、任意の `settings` JSON 文字列を含むマルチパートフォームデータを受け付けます。

## Parameters {#parameters}

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | ファイル間に挿入するもの: `"blank-line"`、`"rule"`(`---` の行)、または `"filename-heading"`(各ファイル名を見出しとして挿入) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Notes {#notes}

- `.txt`、`.md`、`.markdown`、`.csv`、`.log` ファイルを受け付け、1 回のリクエストにつき 2 ～ 50 個です。
- すべてのファイルは UTF-8 テキストである必要があります。バイナリまたは UTF-8 以外のファイルは、エラーにファイル名を示して拒否されます。
- すべての入力が同じ拡張子の場合、出力もその拡張子を保ちます(`merged.md`、`merged.log`)。異なる拡張子が混在する場合は `merged.txt` になります。
- `filename-heading` を指定すると、Markdown 出力では `# name.md` 見出しを、プレーンテキスト出力では `==> name.txt <==` のマーカー行を使用します。
- 各ファイル末尾の空行は削除され、区切りが文書の間にきれいに収まります。先頭のバイトオーダーマークは取り除かれます。
- CSV ファイルはプレーンテキストとして結合されます。ヘッダー行を 1 つにして表を結合するには [Merge CSVs](./merge-csvs) を使用してください。
- `.eml` メールファイルはまだサポートされていません。
