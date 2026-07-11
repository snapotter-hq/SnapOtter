---
description: "品質レベル、または目標ファイルサイズによって画像のファイルサイズを削減します。"
i18n_source_hash: af4685da7e64
i18n_provenance: human
i18n_output_hash: 2aa6e052c339
---

# 圧縮 {#compress}

品質レベルまたはキロバイト単位の目標ファイルサイズを指定して画像のファイルサイズを削減します。目標サイズに正確に合わせるため、反復的な二分探索を使用します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/compress`

画像ファイルとJSONの `settings` フィールドを含むmultipartフォームデータを受け付けます。

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| mode | string | いいえ | `"quality"` | 圧縮モード: `quality` または `targetSize` |
| quality | number | いいえ | `80` | 品質レベル（1〜100）。モードが `quality` のときに使用されます。 |
| targetSizeKb | number | いいえ | - | 目標ファイルサイズ（キロバイト）。モードが `targetSize` のときに使用されます。 |

## リクエスト例 {#example-request}

品質60に圧縮:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

目標サイズ200 KBに圧縮:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## 補足 {#notes}

- `quality` モードでは、値が低いほどファイルが小さくなり、圧縮アーティファクトが多くなります。ウェブ用途では80が良いデフォルトです。
- `targetSize` モードでは、エンジンが目標を超えない範囲でできるだけ近づけるよう反復圧縮を行います。
- 出力形式は入力形式に一致します。圧縮は各形式のネイティブなエンコード（例: JPEGファイルにはJPEG品質、WebPファイルにはWebP品質）に適用されます。
- デフォルトの品質（80）で問題ない場合は、`quality` パラメータを完全に省略できます。
