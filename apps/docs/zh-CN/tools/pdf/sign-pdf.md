---
description: "使用归一化的页面放置坐标将上传的签名图像盖印到 PDF 上。"
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: d0799de1e901
---

# Sign PDF {#sign-pdf}

将一个或多个上传的签名 PNG 图像盖印到 PDF 的任意页面上。此路由使用自定义的 multipart 契约，因为它需要 PDF、一个或多个签名图像以及放置坐标。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

接受 multipart 表单数据。PDF 以 `file` 发送；签名以 `sig0`、`sig1` 等发送；放置坐标以 `placements` JSON 字段发送。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 要签名的 PDF 文件 |
| sig0 | file | Yes | - | 第一个签名图像。其他图像使用 `sig1`、`sig2` 等 |
| placements | JSON string | Yes | - | 放置对象数组：`{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | No | - | 用于通过 SSE 跟踪进度的可选 UUID |
| fileId | string | No | - | 可选的文件库 ID，用于将签名后的结果保存为新版本 |

## Placement Coordinates {#placement-coordinates}

| Field | Type | Description |
|-------|------|-------------|
| sig | integer | 签名图像索引。`0` 映射到 `sig0` |
| page | integer | 从零开始的 PDF 页面索引 |
| x | number | 以页面比例表示的左侧位置 |
| y | number | 以页面比例表示的顶部位置 |
| w | number | 以页面比例表示的签名宽度 |
| h | number | 以页面比例表示的签名高度 |

坐标使用左上角为原点。数值可能会略微超出页面边缘；PDF 渲染器会将最终盖印裁剪到页面范围内。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

如果请求无法在同步等待窗口内完成，API 会返回：

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

连接到 `/api/v1/jobs/<jobId>/progress`，并在作业完成时下载结果。

## Notes {#notes}

- 接受的 PDF 输入格式：`.pdf`。
- 签名图像必须是有效的图像文件，通常是带透明度的 PNG。
- 最多接受 100 个签名图像和 100 个放置坐标。
- `sign-pdf` 是一个自定义路由，不使用标准工具的 `settings` JSON 字段。
