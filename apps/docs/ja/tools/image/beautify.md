---
description: "プレーンなスクリーンショットを、グラデーション背景、デバイスフレーム、シャドウ、SNS 向けサイズで洗練された画像に仕上げます。"
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: 6b0a1b465ae7
---

# Beautify Screenshot {#beautify-screenshot}

スクリーンショットにグラデーション背景、デバイスフレーム、シャドウ、ウォーターマーク、SNS 向けサイズを追加します。プロダクトマーケティング、SNS、ドキュメント向けに洗練された画像を作成するのに最適です。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"linear-gradient"` | 背景の種類: `solid`、`linear-gradient`、`radial-gradient`、`image`、`transparent` |
| backgroundColor | string | No | `"#667eea"` | 単色の背景色 (`backgroundType` が `solid` の場合に使用) |
| gradientStops | array | No | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | グラデーションのカラーストップ (最小 2)。各ストップは `color` (16 進) と `position` (0 ～ 100) を持ちます。 |
| gradientAngle | number | No | 135 | グラデーションの角度 (度) (0 ～ 360) |
| padding | number | No | 64 | 画像周辺のパディング (ピクセル) (0 ～ 256) |
| borderRadius | number | No | 12 | スクリーンショットの角の丸み (0 ～ 64) |
| shadowPreset | string | No | `"subtle"` | シャドウプリセット: `none`、`subtle`、`medium`、`dramatic`、`custom` |
| shadowBlur | number | No | 20 | カスタムシャドウのぼかし半径 (0 ～ 100、`shadowPreset` が `custom` の場合に使用) |
| shadowOffsetX | number | No | 0 | カスタムシャドウの水平オフセット (-50 ～ 50) |
| shadowOffsetY | number | No | 10 | カスタムシャドウの垂直オフセット (-50 ～ 50) |
| shadowColor | string | No | `"#000000"` | カスタムシャドウの色 (16 進) |
| shadowOpacity | number | No | 30 | カスタムシャドウの不透明度 (0 ～ 100) |
| frame | string | No | `"none"` | デバイスまたはウィンドウのフレーム: `none`、`macos-light`、`macos-dark`、`windows-light`、`windows-dark`、`browser-light`、`browser-dark`、`iphone`、`iphone-dark`、`macbook`、`macbook-dark`、`ipad`、`ipad-dark` |
| frameTitle | string | No | - | ウィンドウフレームのタイトルバーに表示されるタイトルテキスト |
| socialPreset | string | No | `"none"` | SNS 向けサイズにリサイズ: `none`、`twitter`、`linkedin`、`instagram-square`、`instagram-story`、`facebook`、`producthunt` |
| watermarkText | string | No | - | 任意のウォーターマークテキストオーバーレイ |
| watermarkPosition | string | No | `"bottom-right"` | ウォーターマークの位置: `top-left`、`top-right`、`bottom-left`、`bottom-right`、`center` |
| watermarkOpacity | number | No | 50 | ウォーターマークの不透明度 (0 ～ 100) |
| outputFormat | string | No | `"png"` | 出力形式: `png`、`jpeg`、`webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### With Background Image {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Notes {#notes}

- 2 つのファイルフィールドを受け付けます: `file` (必須、メインのスクリーンショット) と `backgroundImage` (任意、`backgroundType` が `image` の場合に使用)。
- HEIC、RAW、PSD、SVG の入力形式をサポートします (自動的にデコードされます)。
- シャドウプリセットは特定の値にマッピングされます:
  - `subtle`: ぼかし 20、offsetY 4、不透明度 20%
  - `medium`: ぼかし 40、offsetY 10、不透明度 35%
  - `dramatic`: ぼかし 80、offsetY 20、不透明度 50%
- SNS プリセットは、`contain` モードを使用して最終出力をターゲットサイズに合わせてリサイズします:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- デバイスフレーム (`iphone`、`macbook`、`ipad`) は画像の周囲にハードウェアのベゼルを適用し、`borderRadius` 設定をスキップします。
- 透明度が必要な場合 (シャドウ、角の丸み、デバイスフレーム、透明背景)、`jpeg` が選択されていても出力は PNG に強制されます。
- 画像背景はパイプライン/バッチモードではサポートされません。
