---
description: "Cắt một đoạn ra khỏi tệp âm thanh bằng cách chỉ định thời gian bắt đầu và kết thúc."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: 0fed4c7599a1
---

# Trim Audio {#trim-audio}

Cắt một đoạn ra khỏi tệp âm thanh bằng cách chỉ định thời gian bắt đầu và kết thúc tính bằng giây.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Nhận dữ liệu multipart form với một tệp âm thanh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Thời gian bắt đầu tính bằng giây (tối thiểu 0) |
| endS | number | Yes | - | Thời gian kết thúc tính bằng giây (phải sau thời gian bắt đầu) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Thời gian được chỉ định bằng giây và có thể bao gồm phần thập phân (ví dụ `10.5`).
- Giá trị `endS` phải lớn hơn `startS`.
- Nếu `endS` vượt quá thời lượng âm thanh, tệp sẽ được cắt đến cuối.
- Đầu ra thường giữ nguyên container của tệp đầu vào. Đầu vào AAC được ghi thành M4A, còn các đầu vào chỉ giải mã được nhưng không hỗ trợ sẽ chuyển về MP3.
