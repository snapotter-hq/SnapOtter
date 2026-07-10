---
description: "使用 AI 將影像背景替換為純色或漸層。"
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: 51c11d8ea37f
---

# Background Replace {#background-replace}

將影像背景替換為純色或漸層。AI 模型會偵測主體、移除原始背景，並將主體合成到你所選的背景上。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

接受包含影像檔案及 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"color"` | 背景模式：`color` 或 `gradient` |
| color | string | No | `"#ffffff"` | 背景十六進位色碼（當 backgroundType 為 `color` 時） |
| gradientColor1 | string | No | - | 第一個漸層十六進位色碼 |
| gradientColor2 | string | No | - | 第二個漸層十六進位色碼 |
| gradientAngle | integer | No | `180` | 漸層角度（0-360 度） |
| feather | integer | No | `0` | 邊緣羽化半徑（0-20） |
| format | string | No | `"png"` | 輸出格式：`png` 或 `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
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
- HEIC、RAW、PSD 及 SVG 輸入會在處理前自動解碼。
- 輸出預設為 PNG，以保留主體周圍的透明度。
