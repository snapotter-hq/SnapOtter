---
description: "Trích xuất văn bản từ tài liệu PDF bằng OCR hỗ trợ AI."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: 49576592ebd9
---

# PDF OCR {#pdf-ocr}

Trích xuất văn bản từ tài liệu PDF bằng nhận dạng ký tự quang học hỗ trợ AI. Hỗ trợ nhiều bậc chất lượng và ngôn ngữ. Yêu cầu cài đặt gói tính năng OCR.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings` tùy chọn.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| quality | string | Không | `"balanced"` | Bậc chất lượng OCR: `fast`, `balanced`, `best` |
| language | string | Không | `"auto"` | Ngôn ngữ tài liệu: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Không | `"all"` | Chọn trang, ví dụ `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Example Response {#example-response}

Trả về `202 Accepted`. Theo dõi tiến độ qua SSE tại `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Định dạng đầu vào được chấp nhận: `.pdf`.
- Đây là một công cụ AI yêu cầu cài đặt **gói tính năng OCR**. Nếu gói chưa được cài đặt, API trả về `501 Not Implemented`.
- Bậc chất lượng `fast` dùng một mô hình nhẹ hơn để xử lý nhanh hơn; `best` dùng một mô hình chính xác hơn nhưng đánh đổi bằng tốc độ.
- Cài đặt ngôn ngữ `auto` cố gắng phát hiện ngôn ngữ tài liệu một cách tự động.
- Bạn có thể nhắm đến các trang cụ thể bằng cách dùng phạm vi (`"1-3"`), danh sách ngăn cách bằng dấu phẩy (`"1,3,5"`), hoặc `"all"` cho mọi trang.
- Đối với các PDF đã chứa văn bản có thể chọn được, hãy cân nhắc dùng công cụ [PDF to Text](./pdf-to-text) nhanh hơn thay thế.
