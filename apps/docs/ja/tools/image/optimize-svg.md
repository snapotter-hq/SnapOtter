---
description: "svgo で SVG ファイルを軽量化し、結果をベクターの SVG のまま保持します。精度、複数パス、メタデータ、整形を設定できます。"
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: 29ff06e90e96
i18n_hash_version: 2
---

# SVG最適化 {#optimize-svg}

エディターの残骸、冗長な属性、余分な小数桁を取り除いて SVG ファイルを小さくし、結果を SVG としてダウンロードします。「Web向け最適化」と違い、出力がラスター化されることはありません。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

`.svg` または `.svgz` ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| precision | number | No | `3` | パスデータや数値に残す小数桁数（0～8）。小さい値ほどファイルは小さくなり、曲線はやや粗くなります。 |
| multipass | boolean | No | `true` | 出力が小さくならなくなるまで最適化を繰り返し実行する |
| removeMetadata | boolean | No | `true` | コメント、`<metadata>`、`<desc>`、エディター固有のデータを除去する。保持するにはオフにします。 |
| pretty | boolean | No | `false` | 数行にまとめて軽量化する代わりに、読みやすいようインデントして出力する |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## 注意事項 {#notes}

- 入力は SVG または SVGZ ファイルである必要があります。ラスター画像は `400` とコード `IMAGE_UNDECODABLE` で拒否されます。
- `.svgz` 入力は最初に展開され、出力は常に通常の `.svg` になります。
- SVG は展開後 10 MB までです。それより大きいファイルは `400` とコード `SVG_TOO_LARGE` で拒否されます。
- `viewBox` と `<title>` は常に保持されるため、グラフィックは引き続き拡大縮小でき、アクセシブルな名前も残ります。
- 入力と出力はどちらも SVG サニタイザーを通り、スクリプトなどのアクティブコンテンツが除去されます。
- パスが多いアートワークでは、`precision` を下げるのが最も効果的な軽量化です。0～2 では結果を目視で確認してください。
