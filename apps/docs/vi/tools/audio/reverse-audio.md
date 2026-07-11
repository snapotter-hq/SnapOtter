---
description: "Đảo ngược một tệp âm thanh để nó phát ngược."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 6b6038547b59
---

# Đảo ngược âm thanh {#reverse-audio}

Đảo ngược một tệp âm thanh để nó phát ngược.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Chấp nhận dữ liệu form multipart với một tệp âm thanh và một trường JSON `settings`.

## Tham số {#parameters}

Công cụ này không có tham số cấu hình. Toàn bộ tệp âm thanh được đảo ngược.

## Yêu cầu ví dụ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- Toàn bộ bản âm thanh được đảo ngược từ cuối về đầu.
- Đầu ra thường giữ container đầu vào. Đầu vào AAC được ghi thành M4A, và các đầu vào chỉ giải mã không được hỗ trợ sẽ chuyển về MP3.
