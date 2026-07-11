---
description: "埋め込み画像を圧縮して PDF のファイルサイズを縮小します。"
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 8d439dd1e107
---

# Compress PDF {#compress-pdf}

埋め込み画像をダウンサンプリングして PDF のファイルサイズを削減します。品質スライダーと目標ファイルサイズのどちらかを選択できます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | 圧縮モード: `quality` または `targetSize` |
| quality | integer | No | `75` | 圧縮品質、1〜100（高いほど圧縮が弱い）。`quality` モードで使用 |
| targetSizeKb | number | No | - | 目標ファイルサイズ（キロバイト単位）。`targetSize` モードで使用 |

## Example Request {#example-request}

品質で圧縮する場合:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

目標サイズまで圧縮する場合:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- `quality` モードでは、値を小さくするほどファイルは小さくなりますが、画像の劣化が大きくなります。
- `targetSize` モードでは、二分探索によって要求サイズに収まる最高の DPI を見つけます。
- 圧縮によってファイルが大きくなる場合は、元のバイト列がそのまま返されます。
- テキストやベクターコンテンツは影響を受けません。埋め込みラスター画像のみがダウンサンプリングされます。
