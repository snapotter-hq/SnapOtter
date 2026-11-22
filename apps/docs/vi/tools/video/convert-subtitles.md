---
description: "Chuyển đổi tệp phụ đề giữa SRT, WebVTT và ASS."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 99a0af1b0b9d
i18n_hash_version: 2
---

# Convert Subtitles {#convert-subtitles}

Chuyển đổi tệp phụ đề giữa SRT, WebVTT và ASS. Thời gian và văn bản được giữ nguyên, còn vị trí và hiệu ứng của ASS thì không.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Nhận dữ liệu multipart form với một tệp phụ đề (`.srt`, `.vtt` hoặc `.ass`) và một trường JSON `settings` tùy chọn.

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Định dạng đầu ra: `srt`, `vtt` hoặc `ass` |
| `encoding` | string | `"auto"` | Mã hóa văn bản của đầu vào: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` hoặc `euc-kr` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Notes {#notes}

- Khi chuyển đổi từ ASS, thời gian, văn bản thoại và phần định dạng cơ bản mà định dạng đích có thể chứa đều được giữ lại: SRT giữ chữ nghiêng, in đậm, màu và cỡ chữ dưới dạng thẻ, còn WebVTT giữ chữ nghiêng, in đậm và gạch chân. Vị trí trên màn hình, hoạt ảnh và các hiệu ứng ASS khác bị loại bỏ.
- Đầu ra luôn là UTF-8. Khi `encoding` được đặt thành `auto`, tệp là UTF-8 hợp lệ sẽ được đọc nguyên trạng và mọi tệp khác được đọc là Windows-1252, bảng mã thường dùng cho các tệp SRT Tây Âu cũ. Nếu các ký tự có dấu hoặc không phải Latin bị lỗi hiển thị, hãy đặt `encoding` thành bảng mã thực của tệp (ví dụ `gb18030` cho tiếng Trung giản thể hoặc `windows-1251` cho chữ Kirin).
- Các tệp phụ đề tải lên bị giới hạn ở 1 MB theo mặc định. Hãy tăng hoặc bỏ giới hạn bằng `MAX_SUBTITLE_SIZE_MB`.
