---
description: "パターンテンプレートを使用して複数のファイルをリネームし、ZIP としてダウンロードします。"
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: e2e6d53898eb
---

# Bulk Rename {#bulk-rename}

インデックス、ゼロ埋めインデックス、元のファイル名のプレースホルダーを持つパターンテンプレートを使用して、複数のファイルをリネームします。リネームされたすべてのファイルを含む ZIP アーカイブを返します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

複数のファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pattern | string | No | `"image-{{index}}"` | プレースホルダーを含む命名パターン (最大 1000 文字) |
| startIndex | number | No | `1` | 開始インデックス番号 |

### Pattern Placeholders {#pattern-placeholders}

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{index}}` | `startIndex` から始まる連番 | `1`、`2`、`3` |
| `{{padded}}` | ゼロ埋めされた連番 | `01`、`02`、`03` |
| `{{original}}` | 拡張子なしの元のファイル名 | `photo`、`IMG_001` |

元のファイル拡張子は常に保持されます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

これは次を生成します: `vacation-1.jpg`、`vacation-2.jpg`、`vacation-3.jpg`

元のファイル名を使用する:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

これは次を生成します: `2024-trip-IMG_001-1.jpg`、`2024-trip-IMG_002-2.jpg`

## Example Response {#example-response}

レスポンスは (JSON レスポンスではなく) 直接ストリームされる ZIP ファイルです。レスポンスヘッダーは次のとおりです:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Notes {#notes}

- このツールは画像を処理しません。ファイルをリネームして ZIP アーカイブにパッケージ化するだけです。
- `{{padded}}` のゼロ埋め幅は、ファイルの総数に基づいて自動的に決定されます (例: 100 個のファイルの場合は 3 桁のゼロ埋めを使用: `001`、`002` など)。
- ファイル拡張子は元のファイル名から保持されます。
- ファイル名は安全でない文字を除去するためにサニタイズされます。
- 少なくとも 1 つのファイルを指定する必要があります。
