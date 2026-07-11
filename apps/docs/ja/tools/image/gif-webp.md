---
description: "すべてのフレームを保持したまま、アニメーション GIF を WebP に、またはその逆に変換します。"
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: f7265fbe0c09
---

# GIF/WebP コンバーター {#gif-webp-converter}

すべてのフレームとアニメーションのタイミングを保持したまま、アニメーション GIF ファイルを WebP に、またはその逆に変換します。WebP アニメーションは、同等の GIF よりも通常 25〜35% 小さくなります。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

GIF または WebP ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| quality | integer | いいえ | `80` | WebP エンコードの出力品質（1〜100） |
| lossless | boolean | いいえ | `false` | ロスレス WebP 圧縮を使用 |
| resizePercent | integer | いいえ | `100` | 出力をパーセンテージでスケール（10〜100） |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## 注記 {#notes}

- `.gif` と `.webp` ファイルのみが受け付けられます。他の画像形式はこのツールではサポートされていません。
- 変換方向は自動です: GIF 入力は WebP 出力を生成し、WebP 入力は GIF 出力を生成します。
- `quality` と `lossless` オプションは、WebP へのエンコード時にのみ適用されます。GIF への変換時は、出力は標準の GIF パレットを使用します。
- 大きなアニメーションの寸法（およびファイルサイズ）を縮小するには `resizePercent` を使用します。
