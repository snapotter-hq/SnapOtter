---
description: "为 PDF 的每一页添加页码。"
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: c41c0a34a46d
---

# PDF Page Numbers {#pdf-page-numbers}

为 PDF 的每一页添加“Page N of M”页码。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bc"` | 页码位置：`bl`、`bc`、`br`、`tl`、`tc`、`tr` |
| fontSize | integer | No | `10` | 以点为单位的字号（6-24） |

### Position Values {#position-values}

- `tl` 左上，`tc` 顶部居中，`tr` 右上
- `bl` 左下，`bc` 底部居中，`br` 右下

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- 页码以“Page 1 of 10”的格式渲染。
- 页码会添加到每一页，包括任何现有的标题页或封面页。
- 默认位置 `"bc"` 会将页码放在每页的底部居中位置。
