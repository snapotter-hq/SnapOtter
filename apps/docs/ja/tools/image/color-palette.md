---
description: "画像から主要な色をカラーパレットとして抽出します。"
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: dbe78e52bdf9
---

# カラーパレット {#color-palette}

画像から主要な色を抽出し、16進数のカラー値として返します。量子化された頻度分析を使って、最も目立つ視覚的に区別しやすい色を特定します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

画像ファイルとオプションのJSONの `settings` フィールドを含むmultipartフォームデータを受け付けます。

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| count | integer | いいえ | `8` | 抽出する色の数（2〜16） |
| format | string | いいえ | `"hex"` | カラー形式: `hex`、`rgb`、`hsl` |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## レスポンス例 {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## レスポンスフィールド {#response-fields}

| フィールド | 型 | 説明 |
|-------|------|-------------|
| filename | string | サニタイズされたファイル名 |
| colors | array | 要求された形式のカラー文字列の配列。優勢度の順（最も頻度が高いものが先頭） |
| hex | array | 16進数のカラー文字列の配列（`format` の設定に関わらず常に16進数） |
| count | number | 抽出された色の数 |

## 補足 {#notes}

- 最大 `count` の主要色を返します（デフォルト8、範囲2〜16）。頻度の順（最も一般的なものが先頭）で並びます。
- 画像は分析のため内部的に100x100ピクセルにリサイズされるため、パレットは細かいディテールではなく全体的な色の分布を表します。
- 色はメディアンカット量子化で抽出されます。これは最も範囲が広いチャンネルに沿ってピクセル集団を再帰的に分割します。
- 分析前にアルファチャンネルは削除されるため、透明な領域は考慮されません。
- これは読み取り専用のエンドポイントです。ダウンロード可能な出力ファイルや `jobId` は生成しません。
- HEIC、RAW、PSD、SVG の入力は分析前に自動でデコードされます。
