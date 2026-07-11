---
description: "ページサイズ、向き、目標ファイルサイズオプションを指定して、1 つ以上の画像を PDF ドキュメントに結合します。"
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: 535213c32470
---

# 画像から PDF {#image-to-pdf}

1 つ以上の画像を PDF ドキュメントに結合します。複数のページサイズ、向き、余白、および品質調整によるオプションのファイルサイズ指定に対応しています。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

1 つ以上の画像ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| pageSize | string | いいえ | `"A4"` | ページサイズ: `A4`、`Letter`、`A3`、`A5` |
| orientation | string | いいえ | `"portrait"` | ページの向き: `portrait` または `landscape` |
| margin | number | いいえ | `20` | ページ余白（ポイント、0〜500） |
| targetSize | object | いいえ | - | 目標ファイルサイズの制約（下記参照） |
| collate | boolean | いいえ | `true` | すべての画像を 1 つの PDF に結合します。`false` の場合、画像ごとに 1 つの PDF を作成します。 |

### Target Size オブジェクト {#target-size-object}

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| value | number | はい | 目標サイズの値 |
| unit | string | はい | 単位: `KB` または `MB` |

最小目標サイズは 50 KB です。

## リクエスト例 {#example-request}

基本的な複数画像の PDF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

ファイルサイズ目標付き:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

画像ごとに 1 つの PDF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## レスポンス例（結合済み） {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## レスポンス例（非結合） {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## レスポンス例（目標サイズ付き） {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## 注記 {#notes}

- 画像はページの中央に配置され、アスペクト比を保持したまま余白内に収まるようにスケールされます。画像が拡大されることはありません。
- `collate` が `false` の場合、各画像は個別の PDF ファイルになり、ダウンロードはすべての PDF を含む ZIP アーカイブになります。
- 目標サイズ機能は、予算内に収まる最良の品質を見つけるために、JPEG 品質レベル（10〜95）に対する反復的な二分探索を使用します。
- 透明な画像は、PDF に埋め込む前に白にフラット化されます。
- 対応する入力形式: JPEG、PNG、WebP、AVIF、TIFF、GIF、HEIC、RAW、PSD、SVG など。
- 埋め込み前に EXIF の向きが自動的に適用されます。
