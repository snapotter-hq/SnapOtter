---
description: "Tăng tốc hoặc làm chậm phát lại âm thanh bằng một hệ số nhân."
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: ce42394f75b8
---

# Tốc độ âm thanh {#audio-speed}

Tăng tốc hoặc làm chậm phát lại âm thanh bằng cách áp dụng một hệ số nhân tốc độ.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

Chấp nhận dữ liệu form multipart với một tệp âm thanh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| factor | number | Không | `1.5` | Hệ số nhân tốc độ (0.25 đến 4). Giá trị dưới 1 làm chậm; trên 1 tăng tốc. |

## Yêu cầu ví dụ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## Phản hồi ví dụ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## Ghi chú {#notes}

- Hệ số `0.25` phát ở một phần tư tốc độ (dài gấp 4 lần). Hệ số `4` phát ở tốc độ gấp bốn (ngắn hơn 4 lần).
- Cao độ được giữ nguyên trong khi tốc độ thay đổi (kéo giãn thời gian). Dùng pitch-shift để điều chỉnh cao độ một cách độc lập.
- Đầu ra thường giữ container đầu vào. Đầu vào AAC được ghi thành M4A, và các đầu vào chỉ giải mã không được hỗ trợ sẽ chuyển về MP3.
