---
description: "在單一工具中對動態 GIF 進行縮放、最佳化、變速、反轉、旋轉並擷取影格。"
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: f09b6c1fd108
---

# GIF 工具 {#gif-tools}

縮放、最佳化、變速、反轉、擷取影格並旋轉動態 GIF。在單一工具中提供多種操作模式。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## 參數 {#parameters}

### 共用參數 {#common-parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| mode | string | 否 | `"resize"` | 操作模式：`resize`、`optimize`、`speed`、`reverse`、`extract`、`rotate` |
| loop | number | 否 | 0 | 輸出 GIF 的循環次數（0 = 無限，1-100 = 有限循環） |

### 縮放模式參數 {#resize-mode-parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| width | integer | 否 | - | 目標寬度（像素，1 到 16384） |
| height | integer | 否 | - | 目標高度（像素，1 到 16384） |
| percentage | number | 否 | - | 依百分比縮放（1 到 500）。設定後會覆寫 width/height。 |

### 最佳化模式參數 {#optimize-mode-parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| colors | number | 否 | 256 | 調色盤中的最大顏色數（2 到 256） |
| dither | number | 否 | 1.0 | 抖動強度（0 到 1，0 表示停用抖動） |
| effort | number | 否 | 7 | 最佳化強度等級（1 到 10，越高越慢但檔案越小） |

### 變速模式參數 {#speed-mode-parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| speedFactor | number | 否 | 1.0 | 速度倍率（0.1 到 10）。大於 1 加速，小於 1 減速。 |

### 擷取模式參數 {#extract-mode-parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| extractMode | string | 否 | `"single"` | 擷取模式：`single`、`range`、`all` |
| frameNumber | number | 否 | 0 | 在 `single` 模式下要擷取的影格索引（從 0 起算） |
| frameStart | number | 否 | 0 | `range` 模式的起始影格索引（從 0 起算） |
| frameEnd | number | 否 | - | `range` 模式的結束影格索引（從 0 起算，含此值） |
| extractFormat | string | 否 | `"png"` | 擷取影格的格式：`png`、`webp` |

### 旋轉模式參數 {#rotate-mode-parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| angle | number | 否 | - | 旋轉角度：`90`、`180` 或 `270` 度 |
| flipH | boolean | 否 | `false` | 水平翻轉 |
| flipV | boolean | 否 | `false` | 垂直翻轉 |

## 範例請求 {#example-requests}

### 縮放 {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### 最佳化 {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### 加速 {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### 擷取單一影格 {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Info 子路由 {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

傳回動態 GIF 的中繼資料，而不對其進行處理。

### Info 請求 {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Info 回應 {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## 注意事項 {#notes}

- 主處理端點使用標準的 `createToolRoute` factory。
- info 端點僅需上傳檔案（不需要設定）。
- 在 `resize` 模式下，若提供了 `percentage`，它會優先於 `width`/`height`。縮放時使用 `fit: inside` 以維持長寬比。
- 在 `speed` 模式下，影格延遲會除以速度係數。每影格最小延遲為 20ms（GIF 規格限制）。
- 在 `reverse` 模式下，也可使用 `speedFactor` 參數，在反轉的同時調整速度。
- 在 `extract` 模式下搭配 `range` 或 `all` 時，輸出為包含個別影格的 ZIP 檔案。
- 在 `rotate` 模式下，每個影格會被個別處理並重新組合為動畫。
- `loop` 參數控制輸出 GIF 循環的次數。使用 0 表示無限循環。
- info 回應中的 `duration` 欄位是動畫的總時長（毫秒）。
