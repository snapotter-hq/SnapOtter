---
description: "排列 PDF 页面以便折叠成小册子。"
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: c8fcdb985453
---

# 小册子 PDF {#booklet-pdf}

对页面进行拼版以进行双面打印，使打印出的纸张可以折叠成小册子。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

接受包含 PDF 文件和 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| perSheet | integer | 否 | `2` | 每张纸的页数：`2`、`4`、`6` 或 `8` |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## 示例响应 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## 说明 {#notes}

- 默认的 `perSheet: 2` 在每张纸上并排放置两页，这是双面打印的标准小册子布局。
- 如果总页数不是纸张容量的整数倍，会自动添加空白页。
- 以短边装订方式双面打印输出，然后折叠并装订。
