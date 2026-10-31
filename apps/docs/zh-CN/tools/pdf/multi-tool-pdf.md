---
description: "在一个编辑器或通过 API 对 PDF 进行重新排序、旋转、删除和从其他 PDF 拉取页面。"
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 0fdfff93088e
i18n_hash_version: 2
---

# PDF 多功能工具 {#multi-tool-pdf}

通过显式的页面计划组装 PDF：重新排序、复制、旋转或删除页面，并从其他 PDF 拉取页面，所有操作在一个请求中完成。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

接受包含一个或多个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。
每个请求最多支持 20 个输入文档和 1,200 个输出页面。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 描述 |
|-----------|------|----------|-------------|
| items | array | 是 | 按输出顺序排列的输出页面计划。每个条目为 `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`。`doc` 以上传顺序索引上传的文件（从 0 开始）；`page` 是该文档中基于 1 的页码。 |
| pageCounts | array | 是 | 每个上传文档的实际页数，顺序相同。计划中的页面超出其文档页数时，会以 400 拒绝。 |

## 请求示例 {#example-request}

取第一份文档的第 3 页和第 1 页，再取第二份文档的第 1 页和第 2 页，将第一个输出页面旋转 90° 顺时针：

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## 注意事项 {#notes}

- 同一页面可以在 `items` 中出现多次以复制它。
- 未出现在 `items` 中的页面将从输出中省略。
- `rot` 记录复制页面上的新显示方向（与任何现有旋转组合）；页面内容不会被修改。
- 旋转按每个输出副本应用，因此副本可以有不同的旋转。
- 输出是一个新的扁平文档；源书签和文档级元数据不会保留。
- 处理需要 qpdf 二进制文件，该文件包含在官方 Docker 镜像中。
