---
description: "透過漸層背景、裝置外框、陰影及社群媒體尺寸，將樸素的截圖轉為精緻影像。"
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: 27db1085803f
---

# Beautify Screenshot {#beautify-screenshot}

為截圖加上漸層背景、裝置外框、陰影、浮水印及社群媒體尺寸。適合為產品行銷、社群媒體及文件製作精緻影像。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"linear-gradient"` | 背景類型：`solid`、`linear-gradient`、`radial-gradient`、`image`、`transparent` |
| backgroundColor | string | No | `"#667eea"` | 純色背景顏色（當 `backgroundType` 為 `solid` 時使用） |
| gradientStops | array | No | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | 漸層色標（最少 2 個）。每個色標具有 `color`（十六進位）及 `position`（0-100）。 |
| gradientAngle | number | No | 135 | 漸層角度（0 至 360 度） |
| padding | number | No | 64 | 影像周圍的內距，以像素為單位（0 至 256） |
| borderRadius | number | No | 12 | 截圖的圓角半徑（0 至 64） |
| shadowPreset | string | No | `"subtle"` | 陰影預設：`none`、`subtle`、`medium`、`dramatic`、`custom` |
| shadowBlur | number | No | 20 | 自訂陰影模糊半徑（0 至 100，當 `shadowPreset` 為 `custom` 時使用） |
| shadowOffsetX | number | No | 0 | 自訂陰影水平偏移（-50 至 50） |
| shadowOffsetY | number | No | 10 | 自訂陰影垂直偏移（-50 至 50） |
| shadowColor | string | No | `"#000000"` | 自訂陰影顏色，以十六進位表示 |
| shadowOpacity | number | No | 30 | 自訂陰影不透明度（0 至 100） |
| frame | string | No | `"none"` | 裝置或視窗外框：`none`、`macos-light`、`macos-dark`、`windows-light`、`windows-dark`、`browser-light`、`browser-dark`、`iphone`、`iphone-dark`、`macbook`、`macbook-dark`、`ipad`、`ipad-dark` |
| frameTitle | string | No | - | 顯示於視窗外框標題列的標題文字 |
| socialPreset | string | No | `"none"` | 調整為社群媒體尺寸：`none`、`twitter`、`linkedin`、`instagram-square`、`instagram-story`、`facebook`、`producthunt` |
| watermarkText | string | No | - | 選用的浮水印文字疊層 |
| watermarkPosition | string | No | `"bottom-right"` | 浮水印位置：`top-left`、`top-right`、`bottom-left`、`bottom-right`、`center` |
| watermarkOpacity | number | No | 50 | 浮水印不透明度（0 至 100） |
| outputFormat | string | No | `"png"` | 輸出格式：`png`、`jpeg`、`webp` |

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

- 接受兩個檔案欄位：`file`（必填，主要截圖）及 `backgroundImage`（選填，當 `backgroundType` 為 `image` 時使用）。
- 支援 HEIC、RAW、PSD 及 SVG 輸入格式（自動解碼）。
- 陰影預設對應到特定的數值：
  - `subtle`：模糊 20、offsetY 4、不透明度 20%
  - `medium`：模糊 40、offsetY 10、不透明度 35%
  - `dramatic`：模糊 80、offsetY 20、不透明度 50%
- 社群媒體預設會使用 `contain` 模式將最終輸出調整為符合目標尺寸：
  - `twitter`：1600x900
  - `linkedin`：1200x627
  - `instagram-square`：1080x1080
  - `instagram-story`：1080x1920
  - `facebook`：1200x630
  - `producthunt`：1270x760
- 裝置外框（`iphone`、`macbook`、`ipad`）會在影像周圍套用硬體邊框，並略過 `borderRadius` 設定。
- 當需要透明度時（陰影、圓角、裝置外框或透明背景），即使選取了 `jpeg`，輸出也會強制為 PNG。
- 影像背景在 pipeline/批次模式中不支援。
