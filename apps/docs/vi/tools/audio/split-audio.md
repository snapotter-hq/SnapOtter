---
description: "Chia âm thanh theo khoảng thời gian, số phần bằng nhau, hoặc phát hiện im lặng."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: 36399c884a4f
---

# Split Audio {#split-audio}

Chia một tệp âm thanh thành các đoạn theo khoảng thời gian cố định, số phần bằng nhau, hoặc phát hiện im lặng tự động. Trả về một tệp lưu trữ ZIP chứa các đoạn.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

Nhận dữ liệu multipart form với một tệp âm thanh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"time"` | Chiến lược chia: `time`, `parts`, `silence` |
| segmentS | number | No | `60` | Độ dài mỗi đoạn tính bằng giây, 1 đến 3600 (dùng khi mode là `time`) |
| parts | integer | No | `2` | Số phần bằng nhau, 2 đến 20 (dùng khi mode là `parts`) |
| thresholdDb | number | No | `-40` | Ngưỡng im lặng tính bằng dB, -80 đến -20 (dùng khi mode là `silence`) |
| minSilenceS | number | No | `0.3` | Khoảng lặng tối thiểu tính bằng giây, 0.1 đến 10 (dùng khi mode là `silence`) |

## Example Request {#example-request}

Chia thành các đoạn 30 giây:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Chia theo phát hiện im lặng:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notes {#notes}

- `downloadUrl` trỏ đến một tệp lưu trữ ZIP chứa tất cả các đoạn.
- Chỉ các tham số liên quan đến `mode` đã chọn mới được dùng; các tham số khác bị bỏ qua.
- Tên tệp của các đoạn được đánh số tuần tự (ví dụ `part-000.mp3`, `part-001.mp3`).
- Định dạng đầu ra khớp với định dạng đầu vào.
