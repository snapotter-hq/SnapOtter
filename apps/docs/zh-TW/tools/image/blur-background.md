---
description: "使用 AI 模糊背景，同時保持主體清晰。"
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: d1ee9570d556
---

# Blur Background {#blur-background}

模糊影像背景，同時保持主體清晰。AI 模型會分離主體、對原始背景套用模糊，並將清晰的主體合成於上層。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

接受包含影像檔案及 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| intensity | integer | No | `50` | 模糊強度（1-100） |
| feather | integer | No | `0` | 邊緣羽化半徑（0-20） |
| format | string | No | `"png"` | 輸出格式：`png` 或 `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

可透過 SSE 在 `GET /api/v1/jobs/{jobId}/progress` 追蹤進度。當工作完成時，SSE 串流會發出帶有下載 URL 的 `completed` 事件。

## Notes {#notes}

- 這是一個 AI 驅動的工具，會回傳 `202 Accepted` 並以非同步方式處理。請連線至 SSE 端點以接收進度更新與最終結果。
- 需要安裝 **background-removal** 功能套件。若套件不可用，會回傳 `501`。
- 較高的強度值會產生更強的模糊效果。超過 80 的值會產生明顯的散景般的主體分離感。
- HEIC、RAW、PSD 及 SVG 輸入會在處理前自動解碼。
