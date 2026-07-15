---
description: "Tăng hoặc giảm âm lượng bằng một mức khuếch đại cố định tính bằng decibel."
i18n_source_hash: 4bc993fd4e08
i18n_provenance: human
i18n_output_hash: 08ab23fad5a9
---

# Điều chỉnh âm lượng {#volume-adjust}

Tăng hoặc giảm âm lượng của một tệp âm thanh bằng cách áp dụng một mức khuếch đại cố định tính bằng decibel.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

Nhận dữ liệu multipart form với một tệp âm thanh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| gainDb | number | No | `3` | Điều chỉnh âm lượng tính bằng decibel (-30 đến 30) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- Giá trị dương làm tăng âm lượng; giá trị âm làm giảm âm lượng.
- Mức khuếch đại dương lớn có thể gây méo tiếng (clipping). Dùng normalize-audio để cân bằng độ lớn an toàn.
- Đầu ra thường giữ nguyên container của tệp đầu vào. Đầu vào AAC được ghi thành M4A, còn các đầu vào chỉ giải mã được nhưng không hỗ trợ sẽ chuyển về MP3.
