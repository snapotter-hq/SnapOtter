---
description: "位置、不透明度、ブレンドモードを指定して画像を重ね合わせ、合成します。"
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: 4d3d075ee04b
---

# 画像合成 {#image-composition}

ベース画像の上にオーバーレイ画像を重ね、位置、不透明度、ブレンドモードを設定します。ロゴやグラフィックの合成、複数画像の組み合わせに便利です。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/compose`

**2つの**画像ファイルとJSONの `settings` フィールドを含むmultipartフォームデータを受け付けます。

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| x | number | いいえ | `0` | 左上隅からのオーバーレイの水平オフセット（ピクセル、最小0） |
| y | number | いいえ | `0` | 左上隅からのオーバーレイの垂直オフセット（ピクセル、最小0） |
| opacity | number | いいえ | `100` | オーバーレイの不透明度パーセンテージ（0〜100） |
| blendMode | string | いいえ | `"over"` | 合成のブレンドモード |

### ブレンドモード {#blend-modes}

| 値 | 説明 |
|-------|-------------|
| `over` | 通常のオーバーレイ（デフォルト） |
| `multiply` | ピクセル値を乗算して暗くする |
| `screen` | 反転・乗算・再反転で明るくする |
| `overlay` | ベースの明るさに基づいて乗算とスクリーンを組み合わせる |
| `darken` | 各レイヤーの暗い方のピクセルを残す |
| `lighten` | 各レイヤーの明るい方のピクセルを残す |
| `hard-light` | 強いコントラストのオーバーレイ |
| `soft-light` | 控えめなコントラストのオーバーレイ |
| `difference` | レイヤー間の絶対差 |
| `exclusion` | 差分に似ているがコントラストが低い |

### ファイルフィールド {#file-fields}

| フィールド名 | 必須 | 説明 |
|------------|----------|-------------|
| file | はい | ベース/背景画像 |
| overlay | はい | オーバーレイ/前景画像 |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

乗算ブレンドモードを使用:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## 補足 {#notes}

- 両方の画像は合成の前に検証・デコードされます（HEIC、RAW、PSD、SVG に対応）。
- オーバーレイは `x` と `y` で指定した正確なピクセル座標に配置されます。フィットするようにリサイズはされません。
- 不透明度が100未満の場合、ブレンド前にオーバーレイへアルファマスクが適用されます。
- オーバーレイはベース画像の境界を越えて広がることができます（その部分はクリップされます）。
- 処理前に両方の画像でEXIFの向きが自動適用されます。
- 出力の寸法はベース画像の寸法に一致します。
