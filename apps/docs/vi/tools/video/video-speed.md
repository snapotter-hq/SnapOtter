---
description: "Tăng tốc hoặc làm chậm một video."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: 3c44c5c1863a
---

# Video Speed {#video-speed}

Tăng tốc hoặc làm chậm một video với tùy chọn giữ nguyên cao độ âm thanh.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

Nhận multipart form data gồm một file video và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | Hệ số nhân tốc độ (0.25-4). Giá trị trên 1 tăng tốc, dưới 1 làm chậm |
| keepPitch | boolean | No | `true` | Giữ nguyên cao độ âm thanh khi thay đổi tốc độ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- Hệ số `2` tăng gấp đôi tốc độ phát (giảm một nửa thời lượng). Hệ số `0.5` giảm một nửa tốc độ phát (tăng gấp đôi thời lượng).
- Khi `keepPitch` là `true`, âm thanh được kéo giãn thời gian để giọng nói nghe tự nhiên. Khi `false`, cao độ dịch chuyển theo tỷ lệ với tốc độ.
- Phạm vi hợp lệ là 0.25x đến 4x.
