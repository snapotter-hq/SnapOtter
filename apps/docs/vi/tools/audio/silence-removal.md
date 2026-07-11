---
description: "Loại bỏ các đoạn im lặng khỏi tệp âm thanh."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: 1c6abf754787
---

# Silence Removal {#silence-removal}

Phát hiện và loại bỏ các đoạn im lặng khỏi tệp âm thanh dựa trên ngưỡng và thời lượng tối thiểu có thể cấu hình.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

Nhận dữ liệu multipart form với một tệp âm thanh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | No | `-50` | Ngưỡng im lặng tính bằng dB (-80 đến -20). Âm thanh dưới mức này được coi là im lặng. |
| minSilenceS | number | No | `0.5` | Thời lượng im lặng tối thiểu tính bằng giây cần loại bỏ (0.1 đến 5) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Ngưỡng cao hơn (ít âm hơn) sẽ mạnh tay hơn và loại bỏ cả những đoạn nhỏ tiếng lẫn im lặng thực sự.
- Tăng `minSilenceS` để chỉ cắt bỏ những khoảng dừng dài hơn trong khi vẫn giữ lại những khoảng lặng tự nhiên ngắn.
- Hữu ích để dọn dẹp các bản thu podcast, bài giảng và ghi âm giọng nói.
- Đầu ra thường giữ nguyên container của tệp đầu vào. Đầu vào AAC được ghi thành M4A, còn các đầu vào chỉ giải mã được nhưng không hỗ trợ sẽ chuyển về MP3.
