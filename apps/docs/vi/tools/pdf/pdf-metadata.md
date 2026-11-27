---
description: "Đọc và ghi metadata tài liệu PDF."
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: e00138b4c215
i18n_hash_version: 2
---

# PDF Metadata {#pdf-metadata}

Đọc và cập nhật các trường metadata tài liệu PDF như tiêu đề, tác giả, chủ đề và từ khóa, hoặc xóa hoàn toàn metadata của tài liệu. Khi không cung cấp cài đặt nào, metadata hiện có được trả về mà không sửa đổi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings` tùy chọn.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| title | string | Không | - | Tiêu đề tài liệu (tối đa 500 ký tự) |
| author | string | Không | - | Tác giả tài liệu (tối đa 500 ký tự) |
| subject | string | Không | - | Chủ đề tài liệu (tối đa 500 ký tự) |
| keywords | string | Không | - | Từ khóa tài liệu (tối đa 500 ký tự) |
| stripAll | boolean | Không | false | Xóa toàn bộ từ điển Info (ngày tháng, Creator, Producer, khóa tùy chỉnh), mọi luồng XMP (tài liệu, trang, ảnh) và toàn bộ dữ liệu ứng dụng PieceInfo, rồi ghi các trường đã cho ở trên |
| removeAttachments | boolean | Không | false | Xóa thêm cả tệp nhúng: danh sách tệp đính kèm của tài liệu, chú thích tệp đính kèm và các tệp liên kết (`/AF`). Cần `stripAll` |

Tất cả các tham số đều tùy chọn. Các trường bị bỏ qua được giữ nguyên không thay đổi, trừ khi đặt `stripAll`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Định dạng đầu vào được chấp nhận: `.pdf`.
- Đây là một công cụ nhanh (đồng bộ) trả về kết quả trực tiếp.
- Trường `metadata` trong phản hồi chứa metadata kết quả sau mọi cập nhật.
- Để đọc metadata mà không sửa đổi nó, hãy bỏ qua trường `settings` hoặc gửi một đối tượng rỗng.
- Mỗi trường metadata giới hạn ở 500 ký tự.
- Với `stripAll`, phản hồi còn kèm `stripped`: các khóa Info đã bị xóa (`removed`), luồng XMP của tài liệu có bị xóa hay không (`xmpRemoved`), cấp PDF/A mà đầu vào khai báo (`pdfa`, hoặc `null`), số luồng XMP đã gỡ khỏi trang, ảnh và các đối tượng khác (`objectXmpRemoved`), số từ điển PieceInfo đã bị xóa (`pieceInfoRemoved`) và số tệp nhúng đã bị xóa (`attachmentsRemoved`, luôn là `0` nếu không có `removeAttachments`). Xóa XMP sẽ làm mất tính tuân thủ PDF/A.
- Riêng `stripAll` vẫn giữ các tệp đính kèm nhúng, vì xóa chúng làm thay đổi nội dung tài liệu. Thêm `removeAttachments` để xóa cả chúng. Việc này gỡ tệp XML đính kèm khỏi hóa đơn điện tử ZUGFeRD và Factur-X, và làm mất tính tuân thủ PDF/A-3.
- Gửi `removeAttachments` mà không có `stripAll` sẽ trả về 400.
