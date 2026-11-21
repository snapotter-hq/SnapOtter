---
description: "在 TTF、OTF、WOFF 和 WOFF2 之间转换字体。"
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: 21f3b746cecd
i18n_hash_version: 2
---

# 转换字体 {#convert-font}

在 TrueType (TTF)、OpenType CFF (OTF)、WOFF 和 WOFF2 之间转换字体文件。可以用它把桌面字体变成网页字体，或者为只接受 TrueType 的应用从 OTF 得到 TTF。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

接受包含 `.ttf`、`.otf`、`.woff` 或 `.woff2` 文件以及 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| format | string | 否 | `ttf` | 输出格式：`ttf`、`otf`、`woff` 或 `woff2` |

## 请求示例 {#example-request}

OTF 转 TTF：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF 转 WOFF2（用于网页）：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## 说明 {#notes}

- WOFF 和 WOFF2 是对同一份字体数据的压缩封装，因此转换为这两种格式或从它们转换出来都不会改变轮廓。
- OTF 转 TTF 会把三次 (CFF) 曲线转换为二次 TrueType 曲线。每条曲线与原始曲线的偏差都在 1 个字体单位以内，在正常字号下看不出来，但这种转换不能完全还原。TTF 转 OTF 保留曲线形状，只把控制点取整到整数字体单位。
- 字体的嵌入权限（OS/2 的 `fsType` 字段）保持不变。
- 不支持字体集合 (`.ttc`)。可变 TrueType 字体不能转换为 OTF，可变 CFF2 字体不能转换为 TTF；请改为将它们转换为 WOFF 或 WOFF2。
- 转换在 Python 文档 worker 中运行，超时时间与其他文档工具相同，不在 API 进程内运行。
