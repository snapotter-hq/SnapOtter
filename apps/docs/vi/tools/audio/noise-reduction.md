---
description: "Giảm tạp âm nền khỏi âm thanh bằng khử nhiễu dựa trên FFT."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: 491bba429678
---

# Giảm nhiễu {#noise-reduction}

Giảm tạp âm nền trong một tệp âm thanh bằng cách khử nhiễu dựa trên FFT với cường độ có thể chọn.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Chấp nhận dữ liệu form multipart với một tệp âm thanh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| strength | string | Không | `"medium"` | Cường độ khử nhiễu: `light`, `medium`, `strong` |

## Yêu cầu ví dụ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
```

## Phản hồi ví dụ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Ghi chú {#notes}

- `light` giữ lại nhiều chi tiết hơn nhưng loại bỏ ít nhiễu hơn. `strong` loại bỏ nhiều nhiễu hơn nhưng có thể tạo ra các nhiễu ảo (artifact) nhỏ.
- Kết quả tốt nhất với các bản ghi có tạp âm nền ổn định (tiếng quạt kêu, điều hòa, tiếng rè tĩnh).
- Đầu ra thường giữ container đầu vào. Đầu vào AAC được ghi thành M4A, và các đầu vào chỉ giải mã không được hỗ trợ sẽ chuyển về MP3.
