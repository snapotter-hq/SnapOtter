---
description: "Nâng hoặc hạ cao độ âm thanh theo semitone mà không thay đổi tốc độ."
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: c6ba492ff8a7
---

# Dịch cao độ {#pitch-shift}

Nâng hoặc hạ cao độ của một tệp âm thanh theo một số semitone mà không thay đổi tốc độ phát lại của nó.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

Chấp nhận dữ liệu form multipart với một tệp âm thanh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| semitones | integer | Không | `3` | Số semitone để dịch (-12 đến 12). Phải khác không. |

## Yêu cầu ví dụ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
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

- Giá trị dương nâng cao độ; giá trị âm hạ cao độ.
- Dịch 12 semitone bằng một quãng tám lên; -12 bằng một quãng tám xuống.
- Thời lượng phát lại vẫn giữ nguyên bất kể lượng dịch.
- Đầu ra thường giữ container đầu vào. Đầu vào AAC được ghi thành M4A, và các đầu vào chỉ giải mã không được hỗ trợ sẽ chuyển về MP3.
