---
description: "Kết hợp nhiều tệp âm thanh thành một bản tuần tự."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: 764d6516e3d9
---

# Gộp âm thanh {#merge-audio}

Kết hợp hai hoặc nhiều tệp âm thanh thành một bản tuần tự duy nhất, được nối theo thứ tự chúng được tải lên.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Chấp nhận dữ liệu form multipart với nhiều tệp âm thanh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| format | string | Không | `"mp3"` | Định dạng đầu ra: `mp3`, `wav`, `flac`, `m4a` |

## Yêu cầu ví dụ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Phản hồi ví dụ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Ghi chú {#notes}

- Chấp nhận 2 đến 10 tệp âm thanh mỗi yêu cầu.
- Các tệp được nối theo thứ tự tải lên.
- Tất cả tệp đầu vào được mã hóa lại về định dạng đầu ra và tần số lấy mẫu đã chọn để nối liền mạch.
- Định dạng đầu vào hỗn hợp được hỗ trợ (ví dụ một tệp WAV và một tệp MP3).
