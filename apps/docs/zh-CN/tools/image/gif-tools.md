---
description: "在单个工具中对动画 GIF 进行调整大小、优化、变速、反转、旋转和提取帧。"
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: 79a1cadb7164
---

# GIF 工具 {#gif-tools}

对动画 GIF 进行调整大小、优化、变速、反转、提取帧和旋转。在单个工具中提供多种操作模式。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## 参数 {#parameters}

### 通用参数 {#common-parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| mode | string | 否 | `"resize"` | 操作模式：`resize`、`optimize`、`speed`、`reverse`、`extract`、`rotate` |
| loop | number | 否 | 0 | 输出 GIF 的循环次数（0 = 无限，1-100 = 有限次循环） |

### 调整大小模式参数 {#resize-mode-parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| width | integer | 否 | - | 目标宽度（像素，1 到 16384） |
| height | integer | 否 | - | 目标高度（像素，1 到 16384） |
| percentage | number | 否 | - | 按百分比缩放（1 到 500）。设置后会覆盖 width/height。 |

### 优化模式参数 {#optimize-mode-parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| colors | number | 否 | 256 | 调色板中的最大颜色数（2 到 256） |
| dither | number | 否 | 1.0 | 抖动强度（0 到 1，0 表示禁用抖动） |
| effort | number | 否 | 7 | 优化投入级别（1 到 10，越高越慢但文件越小） |

### 变速模式参数 {#speed-mode-parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| speedFactor | number | 否 | 1.0 | 速度倍数（0.1 到 10）。值 > 1 加速，< 1 减速。 |

### 提取模式参数 {#extract-mode-parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| extractMode | string | 否 | `"single"` | 提取模式：`single`、`range`、`all` |
| frameNumber | number | 否 | 0 | 在 `single` 模式下要提取的帧索引（从 0 开始） |
| frameStart | number | 否 | 0 | `range` 模式下的起始帧索引（从 0 开始） |
| frameEnd | number | 否 | - | `range` 模式下的结束帧索引（从 0 开始，含此帧） |
| extractFormat | string | 否 | `"png"` | 提取帧的格式：`png`、`webp` |

### 旋转模式参数 {#rotate-mode-parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| angle | number | 否 | - | 旋转角度：`90`、`180` 或 `270` 度 |
| flipH | boolean | 否 | `false` | 水平翻转 |
| flipV | boolean | 否 | `false` | 垂直翻转 |

## 请求示例 {#example-requests}

### 调整大小 {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### 优化 {#optimize}

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

### 提取单帧 {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## 响应示例 {#example-response}

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

返回动画 GIF 的元数据而不对其进行处理。

### Info 请求 {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Info 响应 {#info-response}

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

## 说明 {#notes}

- 主处理端点使用标准的 `createToolRoute` 工厂。
- info 端点只需上传文件（无需设置）。
- 在 `resize` 模式下，如果提供了 `percentage`，它会优先于 `width`/`height`。调整大小使用 `fit: inside` 以保持宽高比。
- 在 `speed` 模式下，帧延迟会除以速度因子。每帧的最小延迟为 20ms（GIF 规范限制）。
- 在 `reverse` 模式下，还可使用 `speedFactor` 参数在反转的同时调整速度。
- 在 `extract` 模式且使用 `range` 或 `all` 时，输出是包含各个帧的 ZIP 文件。
- 在 `rotate` 模式下，会单独处理每一帧并重新组装成动画。
- `loop` 参数控制输出 GIF 的循环次数。使用 0 表示无限循环。
- info 响应中的 `duration` 字段是以毫秒为单位的动画总时长。
