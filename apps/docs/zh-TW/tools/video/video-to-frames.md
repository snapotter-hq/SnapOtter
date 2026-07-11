---
description: "從影片中擷取影格並打包成圖片 ZIP。"
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: 29449012b96a
---

# Video to Frames {#video-to-frames}

從影片中擷取個別影格，並以 PNG 或 JPG 圖片的 ZIP 封存檔形式下載。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | 擷取模式：`all`、`nth`、`timestamps` |
| n | integer | No | `10` | 每隔 N 個影格擷取一次（2-1000）。僅在模式為 `"nth"` 時使用 |
| timestamps | string | No | `""` | 以逗號分隔、以秒為單位的時間戳記。當模式為 `"timestamps"` 時為必填 |
| format | string | No | `"png"` | 擷取影格的圖片格式：`png`、`jpg` |

## Example Request {#example-request}

每隔 30 個影格擷取一次並輸出為 JPG：

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

在特定時間戳記擷取影格：

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- `all` 模式會擷取每一個影格，對於長影片可能產生非常大的 ZIP 檔案。請使用 `nth` 或 `timestamps` 模式進行選擇性擷取。
- PNG 保留完整品質但檔案較大。JPG 較小但為有損格式。
- 回應會以包含依序編號圖片檔案的 ZIP 封存檔形式下載。
