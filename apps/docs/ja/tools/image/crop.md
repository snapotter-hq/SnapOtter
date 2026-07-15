---
description: "位置と寸法で領域を指定して画像を切り抜きます。"
i18n_source_hash: 556f37893553
i18n_provenance: human
i18n_output_hash: fd35830e0f75
---

# 画像クロップ {#crop}

位置とサイズで矩形領域を定義して画像を切り抜きます。ピクセルとパーセンテージの両方の単位に対応します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/crop`

画像ファイルとJSONの `settings` フィールドを含むmultipartフォームデータを受け付けます。

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| left | number | はい | - | 切り抜き領域のXオフセット（左端から） |
| top | number | はい | - | 切り抜き領域のYオフセット（上端から） |
| width | number | はい | - | 切り抜き領域の幅 |
| height | number | はい | - | 切り抜き領域の高さ |
| unit | string | いいえ | `"px"` | 値の単位: `px` または `percent` |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

パーセンテージ値を使った切り抜き:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## 補足 {#notes}

- 切り抜き領域は画像の境界内に収まる必要があります。領域が画像を越える場合、リクエストは失敗します。
- `percent` 単位を使う場合、値は画像の寸法に対するパーセンテージを表します（例: `left: 10` は左端から10%を意味します）。
- 出力形式は入力形式に一致します。
- 切り抜き前にEXIFの向きが自動適用されるため、座標は視覚的に正しい向きに対応します。
