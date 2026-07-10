---
description: "使用兩階段穩定化減少相機晃動。"
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: 93de1e595b71
---

# Stabilize Video {#stabilize-video}

使用 FFmpeg 的兩階段 vidstab 穩定化，減少手持拍攝畫面的相機晃動。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。這是一個非同步端點，它會立即回傳 `202 Accepted`，進度則透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 串流傳送。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | 平滑視窗大小（以影格為單位，5-60）。數值越高，動態越平滑 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 穩定化是一個兩階段的處理程序：第一階段分析相機動態，第二階段套用校正。這大約需要單階段工具兩倍的時間。
- 較高的平滑值可移除更多晃動，但可能在邊緣引入輕微的縮放裁切。
- 在工作完成之前，可透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 取得進度更新。
