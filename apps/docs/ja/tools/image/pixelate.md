---
description: "画像全体または特定の領域にモザイク効果を適用します。"
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 8fef788d8344
---

# モザイク {#pixelate}

画像全体または特定の矩形領域にモザイク効果を適用します。顔、ナンバープレート、個人情報などの機密内容を隠すのに便利です。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

画像ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| blockSize | integer | No | `12` | ピクセルブロックのサイズ（2～128）。値を大きくすると粗いモザイクになる |
| region | object | No | - | モザイクを矩形に限定する（下記参照） |

### region オブジェクト {#region-object}

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| left | integer | Yes | 左からのオフセット（ピクセル、>= 0） |
| top | integer | Yes | 上からのオフセット（ピクセル、>= 0） |
| width | integer | Yes | 領域の幅（ピクセル、>= 1） |
| height | integer | Yes | 領域の高さ（ピクセル、>= 1） |

## リクエスト例 {#example-request}

画像全体にモザイクをかける:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

特定の領域にモザイクをかける:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## 注意事項 {#notes}

- `region` を省略した場合、画像全体にモザイクがかかります。
- 領域の座標は画像の左上隅を基準としたピクセル値です。領域は画像の範囲内に収まる必要があります。
- 出力フォーマットは入力フォーマットに一致します。HEIC、RAW、PSD、SVG の入力は処理前に自動的にデコードされます。
