---
description: "ラスター画像をSVGに変換します。白黒（potrace）とフルカラーのマルチレイヤーベクター化に対応します。"
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: 7284f323c58a
---

# Image to SVG {#image-to-svg}

トレースアルゴリズムを用いてラスター画像をSVGにベクター化します。白黒トレース（potrace）とフルカラーのマルチレイヤーベクター化に対応します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| colorMode | string | No | `"bw"` | トレースモード: `bw`（白黒）または`color`（マルチカラーレイヤー） |
| threshold | number | No | 128 | 白黒モードの明度しきい値（0〜255）。これを下回るピクセルは黒になります。 |
| colorPrecision | number | No | 6 | カラーモードの色量子化精度（1〜16）。値が高いほど、より明確な色レイヤーが生成されます。 |
| layerDifference | number | No | 6 | カラーモードにおけるレイヤー間の最小色差（1〜128） |
| filterSpeckle | number | No | 4 | トレースする形状の最小面積（ピクセル、1〜256）。ノイズや斑点を除去します。 |
| pathMode | string | No | `"spline"` | パスの平滑化: `none`（ギザギザ）, `polygon`（直線セグメント）, `spline`（滑らかな曲線） |
| cornerThreshold | number | No | 60 | カラーモードにおける角検出の角度しきい値（0〜180度） |
| invert | boolean | No | `false` | トレース前に画像を反転します（白黒を入れ替え） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Color Vectorization {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Notes {#notes}

- 入力フォーマットに関係なく、出力は常にSVGファイルです。
- HEIC、RAW、PSD、SVGの入力フォーマットに対応します（トレース前に自動的にラスターへデコードされます）。
- 白黒モードはpotraceアルゴリズムを使用します。画像はまずグレースケールに変換され、トレース前に純粋な白黒にしきい値処理されます。
- カラーモードはマルチレイヤー方式を使用します。画像は色レイヤーに量子化され、各レイヤーが個別にトレースされてSVG出力に積み重ねられます。
- `filterSpeckle`の値を低くするとより多くの細部が保持されますが、パスが増えてSVGファイルが大きくなります。
- `pathMode`設定はファイルサイズに大きく影響します。`none`は最も多くのパスを生成し、`spline`は最も滑らかな（通常は最も小さい）出力を生成します。
- ロゴやアイコンで最良の結果を得るには、クリーンで高コントラストな入力で白黒モードを使用してください。写真やイラストには、より高い`colorPrecision`でカラーモードを使用してください。
