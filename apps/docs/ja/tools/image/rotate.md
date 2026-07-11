---
description: "任意の角度で画像を回転し、水平方向または垂直方向に反転します。"
i18n_source_hash: af2581d7cd8d
i18n_provenance: human
i18n_output_hash: f4f347d12e10
---

# 回転・反転 {#rotate-flip}

画像を任意の角度で回転したり、水平方向または垂直方向に反転したりします。回転と反転の操作は 1 回のリクエストで組み合わせられます。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/rotate`

画像ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| angle | number | No | `0` | 回転角度（度、時計回り）。任意の数値を受け付ける。 |
| horizontal | boolean | No | `false` | 画像を水平方向に反転（ミラー） |
| vertical | boolean | No | `false` | 画像を垂直方向に反転 |

## リクエスト例 {#example-request}

時計回りに 90 度回転:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

水平方向に反転:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

回転と反転を同時に行う:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## 注意事項 {#notes}

- 回転が先に適用され、その後に反転操作が行われます。
- 90 度以外の回転（例: 45 度）では、回転した画像に合わせてキャンバスが拡大され、出力フォーマットに応じて透明または黒で塗りつぶされます。
- よく使う値: 90、180、270（4 分の 1 回転）。
- 処理前に EXIF の向きが自動適用されるため、回転は視覚的な向きに対して相対的になります。
