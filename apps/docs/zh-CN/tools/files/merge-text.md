---
description: "按你选择的顺序，将多个文本或 Markdown 文件合并为一个。"
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: 010a0129495b
i18n_hash_version: 2
---

# 合并文本文件 {#merge-text}

将多个文本或 Markdown 文件合并为单个文件。文件按上传顺序拼接，因此如果顺序很重要，请在运行前在文件列表中调整。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

接受包含两个或更多文本文件以及可选 `settings` JSON 字符串的 multipart 表单数据。

## Parameters {#parameters}

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | 文件之间插入的内容：`"blank-line"`、`"rule"`（一行 `---`）或 `"filename-heading"`（以各文件名作为标题） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Notes {#notes}

- 接受 `.txt`、`.md`、`.markdown`、`.csv` 和 `.log` 文件，每个请求 2 到 50 个。
- 每个文件都必须是 UTF-8 文本。二进制文件或非 UTF-8 文件会被拒绝，错误信息中会包含其文件名。
- 当所有输入的扩展名相同时，输出保留该扩展名（`merged.md`、`merged.log`）。混合输入则生成 `merged.txt`。
- 使用 `filename-heading` 时，Markdown 输出使用 `# name.md` 标题；纯文本输出使用 `==> name.txt <==` 标记行。
- 每个文件末尾的空行会被裁掉，使分隔符干净地位于文档之间。开头的字节顺序标记会被丢弃。
- CSV 文件按纯文本拼接。若要将表格合并并只保留一行标题，请使用 [Merge CSVs](./merge-csvs)。
- 暂不支持 `.eml` 邮件文件。
