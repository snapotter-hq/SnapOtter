---
description: "HTML、CSS などに埋め込むために、画像を base64 データ URI に変換します。"
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: d5ee100c5387
---

# 画像から Base64 {#image-to-base64}

1 つ以上の画像を base64 エンコードされた文字列およびデータ URI に変換します。オプションの形式変換、品質制御、リサイズに対応しています。HTML、CSS、JSON、またはメールテンプレートに画像を直接埋め込むのに便利です。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

1 つ以上の画像ファイルとオプションの JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| outputFormat | string | いいえ | `"original"` | エンコード前に変換: `original`、`jpeg`、`png`、`webp`、`avif`、`jxl` |
| quality | number | いいえ | `80` | 非可逆形式の出力品質（1 から 100） |
| maxWidth | number | いいえ | `0` | 最大幅（ピクセル、0 = リサイズなし、拡大はしません） |
| maxHeight | number | いいえ | `0` | 最大高さ（ピクセル、0 = リサイズなし、拡大はしません） |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

複数ファイル:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## レスポンス例 {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## レスポンスフィールド {#response-fields}

| フィールド | 型 | 説明 |
|-------|------|-------------|
| results | array | 正常に変換された画像 |
| errors | array | 処理に失敗した画像（ファイル名とエラーメッセージを含む） |

### Result オブジェクト {#result-object}

| フィールド | 型 | 説明 |
|-------|------|-------------|
| filename | string | 元のファイル名 |
| mimeType | string | エンコードされた出力の MIME タイプ |
| width | number | 最終的な幅（リサイズ後、ピクセル） |
| height | number | 最終的な高さ（リサイズ後、ピクセル） |
| originalSize | number | 元のファイルサイズ（バイト） |
| encodedSize | number | base64 文字列のサイズ（バイト） |
| overheadPercent | number | 元と比較したサイズの差のパーセンテージ（正 = 大きい、負 = 小さい） |
| base64 | string | 生の base64 エンコードされた画像データ |
| dataUri | string | `src` 属性ですぐに使える完全なデータ URI |

## 注記 {#notes}

- Base64 エンコードは、通常、バイナリファイルと比較してサイズが約 33% 増加します。`overheadPercent` フィールドは実際の差を示します。
- `outputFormat` が `"original"` の場合、HEIC/HEIF ファイルは JPEG に変換されます（ブラウザはデータ URI で HEIC を表示できないため）。
- `maxWidth` と `maxHeight` オプションは、`withoutEnlargement` 付きの `fit: inside` を使用してリサイズするため、指定した寸法より小さい画像は拡大されません。
- 1 回のリクエストで複数のファイルを処理できます。各ファイルは独立して処理され、失敗しても他のファイルの成功は妨げられません。
- SVG ファイルは、再エンコードなしで `image/svg+xml` としてそのまま渡されます（形式変換が要求された場合を除く）。
- これは読み取り専用のエンドポイントです。ダウンロード可能なファイルや `jobId` は生成しません。base64 データはレスポンスボディで直接返されます。
