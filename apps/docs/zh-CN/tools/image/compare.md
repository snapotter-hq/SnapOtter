---
description: "并排比较两张图片，进行像素级差异可视化并给出相似度评分。"
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: e5ea400c8d8b
---

# 图片比较 {#image-compare}

上传两张图片以计算像素级差异图和数值相似度百分比。输出是一张用红色高亮标出变化区域的差异图。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/compare`

接受 multipart 表单数据，包含**两个**图片文件。无需 settings 字段。

## 参数 {#parameters}

此工具没有可配置的参数。请恰好上传两个图片文件。

| 字段 | 类型 | 必填 | 说明 |
|-------|------|----------|-------------|
| file（第一张） | file | 是 | 第一张图片 |
| file（第二张） | file | 是 | 第二张图片 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## 响应字段 {#response-fields}

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| jobId | string | 用于下载差异图的作业标识符 |
| similarity | number | 两张图片之间的相似度百分比（0 至 100） |
| dimensions | object | 用于比较的宽度和高度 |
| downloadUrl | string | 下载生成的差异图的 URL |
| originalSize | number | 两张输入图片的合计大小，单位字节 |
| processedSize | number | 差异输出图片的大小，单位字节 |

## 注意事项 {#notes}

- 两张图片在比较前会被缩放到相同尺寸（取各轴的最大值）。
- 差异图以红色高亮标出差异，透明度与变化幅度成正比。相同或几乎相同的像素（差异 < 10）显示为原图的半透明版本。
- 相似度按所有像素平均像素差异的反值计算，并以百分比表示。
- 相似度为 100% 表示两张图片逐像素相同（在比较分辨率下）。
- 无论输入格式如何，差异输出始终为 PNG 格式。
- 两张图片在比较前都会被验证并解码（支持 HEIC、RAW、PSD、SVG）。
- 处理前会在两张图片上自动应用 EXIF 方向。
