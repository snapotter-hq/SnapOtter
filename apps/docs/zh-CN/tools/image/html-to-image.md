---
description: "通过设备模拟将网页或 HTML 片段捕获为高质量图像。"
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: 5e1f1785696c
i18n_hash_version: 2
---

# HTML 转图像 {#html-to-image}

将网页 URL 或原始 HTML 内容捕获为截图图像。支持设备模拟（桌面、平板、手机）、整页捕获以及多种输出格式。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

接受 **JSON 请求体**（非 multipart）。无需上传文件。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| url | string | 有条件 | - | 要捕获的 URL（必须是有效的 URL） |
| html | string | 有条件 | - | 要渲染的原始 HTML 内容（1 到 5,000,000 个字符） |
| format | string | 否 | `"png"` | 输出格式：`jpg`、`png`、`webp` |
| quality | number | 否 | `90` | 有损格式的输出质量（1 到 100） |
| fullPage | boolean | 否 | `false` | 捕获整个可滚动页面，而不仅仅是视口 |
| devicePreset | string | 否 | `"desktop"` | 设备模拟：`desktop`、`tablet`、`mobile`、`custom` |
| viewportWidth | number | 否 | `1280` | 自定义视口宽度（像素，320 到 3840，当 devicePreset 为 `custom` 时使用） |
| viewportHeight | number | 否 | `720` | 自定义视口高度（像素，320 到 2160，当 devicePreset 为 `custom` 时使用） |
| clientJobId | string | 否 | - | 你自己的任务 ID，这样可以在响应返回之前就打开进度流 |

必须提供 `url` 或 `html` 之一，但不能同时提供两者。

### 设备预设 {#device-presets}

| 预设 | 宽度 | 高度 | 移动 UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | 否 |
| `tablet` | 768 | 1024 | 否 |
| `mobile` | 375 | 812 | 是 |
| `custom` | （用户指定） | （用户指定） | 否 |

## 请求示例 {#example-request}

捕获网页：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

渲染 HTML 内容：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

### 加载较慢的页面 {#slow-pages}

捕获作为排队任务运行。如果在同步等待窗口内完成，会返回 `200` 和上面的结果。较慢的捕获则返回 `202` 和一个任务 ID：

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

请跟踪 `progressUrl`（Server-Sent Events），直到任务完成。完成事件携带的结果对象与 `200` 响应相同。你可以通过 `POST /api/v1/jobs/{jobId}/cancel` 取消任务。

::: warning 2.3.0 之后的变更
直到 2.3.0，此端点始终保持请求打开，直到捕获完成，并返回 `200`。只处理 `200` 的脚本现在也应处理 `202`。
:::

## 说明 {#notes}

- 需要在服务器上安装 Chromium。如果浏览器服务不可用，则返回 HTTP 503。
- URL 会针对 SSRF 攻击进行验证（私有/内部网络地址会被阻止）。
- 此端点的速率限制为每小时 120 个请求。
- `originalSize` 始终为 0，因为此工具从 URL/HTML 生成图像。
- 输出文件名为 `screenshot.<format>`。
- 如果页面加载耗时过长，捕获会失败并返回 HTTP 504（网关超时）。
- 如果浏览器服务反复崩溃，它会被临时禁用，捕获会失败并返回 HTTP 503 和代码 `BROWSER_CRASHED`。
- 浏览器崩溃（HTTP 503）会先重试一次再报告失败，与其他排队的图像任务相同。页面加载超时不会重试。
- 已经返回 `202` 的捕获，其失败会在进度流中报告，而不是体现在 HTTP 状态码上。
