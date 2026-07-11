---
description: "Chuyển đổi giữa mono và stereo hoặc hoán đổi kênh trái và phải."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: 62d06018ff52
---

# Kênh âm thanh {#audio-channels}

Chuyển đổi âm thanh giữa bố cục mono và stereo, hoặc hoán đổi kênh trái và phải của một tệp stereo.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Chấp nhận dữ liệu form multipart với một tệp âm thanh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| mode | string | Có | - | Thao tác kênh: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Yêu cầu ví dụ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Phản hồi ví dụ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Ghi chú {#notes}

- `stereo-to-mono` trộn cả hai kênh thành một bản mono duy nhất.
- `mono-to-stereo` nhân đôi kênh mono ra cả trái và phải.
- `swap` hoán đổi kênh trái và phải của một tệp stereo.
- Đầu ra thường giữ container đầu vào. Đầu vào AAC được ghi thành M4A, và các đầu vào chỉ giải mã không được hỗ trợ sẽ chuyển về MP3.
