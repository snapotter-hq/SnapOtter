---
description: "Xem, chỉnh sửa hoặc xóa thẻ metadata âm thanh (ID3)."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: 7122a9bcba50
---

# Metadata âm thanh {#audio-metadata}

Xem, chỉnh sửa hoặc xóa các thẻ metadata âm thanh như tiêu đề, nghệ sĩ và album (ID3 và các định dạng thẻ tương tự).

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

Chấp nhận dữ liệu form multipart với một tệp âm thanh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| strip | boolean | Không | `false` | Xóa tất cả thẻ metadata hiện có |
| title | string | Không | - | Đặt thẻ tiêu đề (tối đa 500 ký tự) |
| artist | string | Không | - | Đặt thẻ nghệ sĩ (tối đa 500 ký tự) |
| album | string | Không | - | Đặt thẻ album (tối đa 500 ký tự) |

## Yêu cầu ví dụ {#example-request}

Chỉnh sửa thẻ metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Xóa toàn bộ metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Phản hồi ví dụ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## Ghi chú {#notes}

- Phản hồi bao gồm một đối tượng `metadata` với định dạng container, thời lượng, bitrate và các thẻ hiện tại.
- Khi `strip` là `true`, mọi trường thẻ bị bỏ qua và mọi thẻ hiện có bị xóa.
- Chỉ những thẻ bạn cung cấp mới được cập nhật; các thẻ không được chỉ định vẫn giữ nguyên.
- Định dạng đầu ra khớp với định dạng đầu vào.
