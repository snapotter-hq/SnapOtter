---
description: "Cân bằng độ lớn về mức chuẩn phát sóng (EBU R128)."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: 661f138f4e53
---

# Chuẩn hóa âm thanh {#normalize-audio}

Cân bằng độ lớn âm thanh về mức chuẩn phát sóng bằng chuẩn hóa EBU R128 (-16 LUFS).

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Chấp nhận dữ liệu form multipart với một tệp âm thanh và một trường JSON `settings`.

## Tham số {#parameters}

Công cụ này không có tham số cấu hình. Nó tự động áp dụng chuẩn hóa độ lớn EBU R128.

## Yêu cầu ví dụ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
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

- Dùng chuẩn độ lớn EBU R128, nhắm mục tiêu -16 LUFS.
- Lý tưởng cho podcast, sách nói và nội dung phát sóng, nơi độ lớn nhất quán là quan trọng.
- Tần số lấy mẫu nguồn được giữ nguyên trong đầu ra.
- Đầu ra thường giữ container đầu vào. Đầu vào AAC được ghi thành M4A, và các đầu vào chỉ giải mã không được hỗ trợ sẽ chuyển về MP3.
