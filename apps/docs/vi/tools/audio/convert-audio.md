---
description: "Chuyển đổi âm thanh giữa các định dạng MP3, WAV, OGG, FLAC và M4A."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: df9906d408e2
---

# Chuyển đổi âm thanh {#convert-audio}

Chuyển đổi tệp âm thanh giữa các định dạng phổ biến gồm MP3, WAV, OGG, FLAC và M4A, với bitrate đầu ra có thể cấu hình.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Chấp nhận dữ liệu form multipart với một tệp âm thanh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| format | string | Không | `"mp3"` | Định dạng đầu ra: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Không | `192` | Bitrate đầu ra tính bằng kbps (32 đến 320) |

## Yêu cầu ví dụ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Phản hồi ví dụ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Ghi chú {#notes}

- Các định dạng đầu vào được hỗ trợ gồm MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF và OPUS.
- Bitrate chỉ áp dụng cho các định dạng mất dữ liệu (MP3, OGG, M4A). Các định dạng không mất dữ liệu như WAV và FLAC bỏ qua cài đặt này.
- Tên tệp đầu ra giữ tên gốc với phần mở rộng mới.
