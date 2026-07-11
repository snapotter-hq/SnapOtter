---
description: "動画から特定の領域を切り出します。"
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: 7139ab9ebe0d
---

# Crop Video {#crop-video}

領域のサイズと位置を指定して、動画から矩形領域を切り出します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | 切り出す領域の幅（ピクセル単位、最小16） |
| height | integer | Yes | - | 切り出す領域の高さ（ピクセル単位、最小16） |
| x | integer | No | `0` | 左上隅からの水平方向のオフセット |
| y | integer | No | `0` | 左上隅からの垂直方向のオフセット |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- 切り出す領域は動画の寸法内に収まる必要があります。`x + width` または `y + height` がソースサイズを超えると、リクエストは 400 エラーを返します。
- 切り出しの最小サイズは 16x16 ピクセルです。
- 寸法は、ほとんどの動画コーデックが要求するとおり偶数に丸められます。
