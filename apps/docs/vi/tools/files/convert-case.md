---
description: "Đổi văn bản thành CHỮ HOA, chữ thường, Title, Sentence case và nhiều kiểu khác."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: 639e67e3fda7
i18n_hash_version: 2
---

# Convert Case {#convert-case}

Dán văn bản, chọn kiểu chữ rồi sao chép kết quả. Văn bản chỉ được gửi đến máy chủ SnapOtter của chính bạn và không đi đâu khác.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Nhận nội dung JSON, không phải multipart form data, và trả về văn bản đã chuyển đổi thay vì một tệp để tải xuống.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (bắt buộc) | Văn bản cần chuyển đổi. Tối đa 1.000.000 ký tự. |
| `mode` | string | (bắt buộc) | Một trong các chế độ bên dưới. |
| `locale` | string | (không có) | Thẻ ngôn ngữ BCP 47, chẳng hạn `tr` hoặc `de`, cho những chữ cái mà kiểu chữ hoa hoặc thường phụ thuộc vào ngôn ngữ. Nếu không có, cách viết hoa giống nhau cho mọi ngôn ngữ. |

| Mode | Input | Output |
|------|-------|--------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Example Response {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notes {#notes}

- `title` giữ các từ tiếng Anh ngắn (a, an, and, of, the, to và các từ tương tự) ở dạng chữ thường trừ khi chúng đứng đầu hoặc cuối dòng. `capitalized` viết hoa mọi từ.
- `sentence` bắt đầu một câu mới ở đầu văn bản, sau một ngắt dòng, và sau `.`, `!`, `?` hoặc `…` theo sau là một khoảng trắng, nên dấu chấm trong `snapotter.com` hoặc `3.5` không được tính.
- `camel`, `pascal`, `snake` và `kebab` tách tại khoảng trắng, dấu câu và chỗ đổi kiểu chữ sẵn có (`XMLHttpRequest` trở thành `xml_http_request`), và chuyển đổi từng dòng riêng biệt.
- Khi `locale` được đặt thành `tr`, `i` viết hoa thành `İ` và `I` viết thường thành `ı`. Chữ `ß` trong tiếng Đức viết hoa thành `SS` ở mọi locale.
- Ứng dụng web gửi ngôn ngữ giao diện hiện tại dưới dạng `locale`.
