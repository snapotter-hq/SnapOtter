---
description: "將文字浮水印燒錄到影片畫面上。"
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: c752499f18db
---

# Watermark Video {#watermark-video}

將文字浮水印燒錄到影片的每一個畫面上，並可設定位置、大小、不透明度和顏色。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | 浮水印文字（1-200 個字元） |
| position | string | No | `"br"` | 在畫面上的位置：`tl`、`tc`、`tr`、`l`、`c`、`r`、`bl`、`bc`、`br` |
| fontSize | integer | No | `36` | 字型大小（以像素為單位，8-120） |
| opacity | number | No | `0.5` | 浮水印不透明度（0.05-1） |
| color | string | No | `"#ffffff"` | 文字的十六進位色碼（例如 `"#ffffff"`） |

### Position Values {#position-values}

- **tl** - 左上，**tc** - 上方置中，**tr** - 右上
- **l** - 左方置中，**c** - 置中，**r** - 右方置中
- **bl** - 左下，**bc** - 下方置中，**br** - 右下

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- 浮水印會永久渲染到影片畫面中，處理後無法移除。
- 浮水印使用 FFmpeg 內建的無襯線字型。
- 若需要圖片浮水印，請改用圖片 Watermark 工具。
