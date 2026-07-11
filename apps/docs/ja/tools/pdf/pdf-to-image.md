---
description: "PDF のページを高品質な画像に変換します。"
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: 2eedea784657
---

# PDF to Image {#pdf-to-image}

PDF のページを高品質なラスター画像に変換します。ページ選択、複数の出力形式、DPI 制御、カラーモードに対応しています。変換前に PDF を確認するための info および preview サブルートも含みます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"png"` | 出力形式: `png`、`jpg`、`webp`、`avif`、`tiff`、`gif`、`heic`、`heif`、`jxl` |
| dpi | number | No | 150 | レンダリング解像度（36〜2400）。DPI が高いほど大きく詳細な画像になります。 |
| quality | number | No | 85 | 非可逆形式の出力品質（1〜100） |
| colorMode | string | No | `"color"` | カラーモード: `color`、`grayscale`、`bw`（白黒しきい値） |
| pages | string | No | `"all"` | ページ選択: `all`、単一ページ（`3`）、範囲（`1-5`）、またはカンマ区切り（`1,3,5-8`） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

ページをレンダリングせずに PDF のページ数を返します。

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info Response {#info-response}

```json
{
  "pageCount": 10
}
```

## Preview Sub-Route {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

すべてのページの低解像度 JPEG サムネイルを base64 データ URL として返します。ページ選択 UI の構築に便利です。

### Preview Request {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview Response {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes {#notes}

- PDF レンダリングには MuPDF を使用し、正しいフォントレンダリングとベクターグラフィックを備えた高精度な出力を提供します。
- パスワード保護された PDF はサポートされておらず、400 エラーを返します。
- `pages` パラメータは柔軟な構文をサポートします:
  - `"all"` または `""` - 全ページ
  - `"3"` - 単一ページ
  - `"1-5"` - ページ範囲（両端含む）
  - `"1,3,5-8"` - 個別ページと範囲の混在
- ページ番号は 1 始まりです。ドキュメントの長さを超えるページを指定すると 400 エラーを返します。
- メインエンドポイントは常に、個別ページのダウンロードと、選択したすべてのページを含む ZIP の両方を生成します。
- preview エンドポイントは 72 DPI でレンダリングし、高速なサムネイル生成のため幅 300px にスケールします。サムネイルは品質 60% の JPEG です。
- preview エンドポイントは `MAX_PDF_PAGES` サーバー設定を尊重し、生成されるサムネイル数を制限します。
- 大きなドキュメントを高 DPI で処理すると、処理時間は比例して増加します。Web 用途では低い DPI（150）、印刷用途ではより高い DPI（300〜600）の使用を検討してください。
