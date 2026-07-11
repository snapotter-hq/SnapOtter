---
description: "明るさ、コントラスト、彩度、色温度、色相、チャンネルを調整し、カラーエフェクトを適用します。"
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: 6d1d3100b874
---

# Adjust Colors {#adjust-colors}

明るさ、コントラスト、露出、彩度、色温度、ティント、色相回転、チャンネルごとのレベル、ワンクリックエフェクト (グレースケール、セピア、反転) を 1 つのエンドポイントにまとめた包括的なカラー調整ツールです。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

画像ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | 明るさの調整 (-100 ～ 100) |
| contrast | number | No | `0` | コントラストの調整 (-100 ～ 100) |
| exposure | number | No | `0` | 露出 / 中間調ガンマ (-100 ～ 100) |
| saturation | number | No | `0` | 色の彩度 (-100 ～ 100) |
| temperature | number | No | `0` | ホワイトバランス: 寒色/青から暖色/オレンジ (-100 ～ 100) |
| tint | number | No | `0` | ティントのシフト: 緑からマゼンタ (-100 ～ 100) |
| hue | number | No | `0` | 色相回転 (度) (-180 ～ 180) |
| sharpness | number | No | `0` | シャープ化の強度 (0 ～ 100) |
| red | number | No | `100` | 赤チャンネルのレベル (0 ～ 200、100 = 変更なし) |
| green | number | No | `100` | 緑チャンネルのレベル (0 ～ 200、100 = 変更なし) |
| blue | number | No | `100` | 青チャンネルのレベル (0 ～ 200、100 = 変更なし) |
| effect | string | No | `"none"` | カラーエフェクト: `none`、`grayscale`、`sepia`、`invert` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

暖かみのあるヴィンテージな見た目を適用する:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes {#notes}

- すべてのパラメータはニュートラルな値がデフォルトになっているため、必要な項目だけを調整できます。
- 調整は次の順序で適用されます: 明るさ、コントラスト、露出、彩度/色相、色温度/ティント、シャープネス、チャンネル、エフェクト。
- 色温度は、青-オレンジ軸および緑-マゼンタ軸で 3x3 の色再結合行列を使用します。
- 露出は Sharp のガンマ関数にマッピングされます (正の値は中間調を明るくし、負の値は暗くします)。
- このエンドポイントはレガシーパス `/api/v1/tools/image/brightness-contrast`、`/api/v1/tools/image/saturation`、`/api/v1/tools/image/color-channels`、`/api/v1/tools/image/color-effects` でも応答します。すべて同じスキーマを使用します。
- 出力形式は入力形式と一致します。HEIC、RAW、PSD、SVG の入力は処理前に自動的にデコードされます。
