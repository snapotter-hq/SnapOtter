---
description: "Tạo một đoạn nhạc chuông từ bất kỳ tệp âm thanh nào."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: 99ea82c04da7
---

# Tạo nhạc chuông {#ringtone-maker}

Tạo một đoạn nhạc chuông (.m4r) từ bất kỳ tệp âm thanh nào bằng cách chọn thời điểm bắt đầu và thời lượng.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Chấp nhận dữ liệu form multipart với một tệp âm thanh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| startS | number | Không | `0` | Thời điểm bắt đầu tính bằng giây (tối thiểu 0) |
| durationS | number | Không | `30` | Thời lượng đoạn tính bằng giây (1 đến 30) |

## Yêu cầu ví dụ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Phản hồi ví dụ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Ghi chú {#notes}

- Đầu ra luôn là định dạng M4R, tương thích với nhạc chuông iPhone.
- Thời lượng nhạc chuông tối đa là 30 giây (giới hạn của Apple).
- Bất kỳ định dạng âm thanh nào cũng có thể dùng làm đầu vào.
