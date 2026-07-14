---
description: "Trích xuất văn bản từ các tệp PDF được quét cục bộ bằng Tesseract tích hợp sẵn hoặc thời gian chạy RapidOCR có độ chính xác cao tùy chọn."
i18n_output_hash: 74e1bebfa9b1
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

Trích xuất văn bản từ từng trang tài liệu PDF được quét mà không gửi PDF đến một dịch vụ bên ngoài. Tầng `fast` tích hợp sử dụng Tesseract. Các tầng `balanced` và `best` tùy chọn sử dụng RapidOCR với các mẫu PP-OCR ONNX được ghim.


<!-- korean-ocr-contract:start -->
::: info Khả năng tương thích OCR tiếng Hàn
OCR Nhanh hỗ trợ `auto`, `en`, `de`, `es`, `fr`, `zh` và `ja`, nhưng không hỗ trợ tiếng Hàn (`ko`). Tiếng Hàn cần gói OCR Chính xác và `balanced` hoặc `best`. Gói chạy trên container Linux amd64 và arm64 chính thức, kể cả máy chủ NVIDIA nơi OCR vẫn chạy bằng CPU. Hệ thống không được hỗ trợ sẽ trả về lỗi tương thích rõ ràng và không âm thầm chuyển về `fast`. Tiếng Hàn với `fast` hoặc bí danh cũ `tesseract` bị từ chối trước khi xếp hàng với `FEATURE_INCOMPATIBLE` và `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings` tùy chọn.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| file | file | Đúng | - | Tệp PDF (nhiều phần), được mã hóa tối đa 512 MiB; giới hạn tải lên của nhà điều hành thấp hơn vẫn được áp dụng |
| quality | string | KHÔNG | Năng động | Cấp chất lượng OCR: `fast`, `balanced` hoặc `best` |
| language | string | Không | `"auto"` | Ngôn ngữ tài liệu: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Không | `"all"` | Chọn trang, ví dụ `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | KHÔNG | Phụ thuộc vào cấp bậc | Cải thiện độ tương phản cục bộ trước khi nhận dạng. Nhanh chóng áp dụng nó trực tiếp; Cân bằng và Tốt nhất chỉ giữ lại biến thể khi việc tính điểm đã hiệu chỉnh cải thiện kết quả. Mặc định là `true` cho `best` và `false` cho `fast`/`balanced` |
| engine | string | KHÔNG | - | Bí danh tương thích không được dùng nữa. Thay vào đó hãy sử dụng `quality`. `tesseract` ánh xạ tới `fast`; giá trị `paddleocr` kế thừa ánh xạ tới `balanced` nhưng không tải PaddlePaddle |

Khi bỏ qua `quality` và `engine`, SnapOtter chọn cấp tốt nhất hiện có theo thứ tự `best`, `balanced`, `fast`. Với tiếng Hàn, hệ thống không bao giờ chọn `fast`; hệ thống dùng `best`, sau đó `balanced`, hoặc trả về lỗi cài đặt hay tương thích của runtime chính xác.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
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
- `fast` được tích hợp sẵn và thêm khoảng 25 MiB vào hình ảnh chính thức. `balanced` và `best` yêu cầu gói OCR chính xác tùy chọn (khoảng 208-234 MiB để tải xuống và 409-488 MiB được cài đặt, tùy thuộc vào mục tiêu).
- Gói chính xác hỗ trợ Linux amd64 và arm64 và sử dụng ONNX Runtime trên CPU, bao gồm cả trên máy chủ NVIDIA.
- Cấp độ được yêu cầu rõ ràng không bao giờ bị hạ cấp một cách âm thầm. Nếu `balanced` hoặc `best` không có sẵn thì API trả về `501` với `FEATURE_NOT_INSTALLED` hoặc `FEATURE_INCOMPATIBLE`.
- Các trang PDF được rasterized ở độ phân giải cao trước OCR. `best` chạy các mô hình PP-OCRv6 trung bình có độ chính xác cao hơn và chấm điểm các biến thể định hướng và nâng cao, cải thiện khả năng nhận dạng nhưng phải trả giá bằng tốc độ.
- Cài đặt ngôn ngữ `auto` cho phép nhận dạng trên bộ tập lệnh được hỗ trợ; một gợi ý rõ ràng có thể cải thiện kết quả cho một ngôn ngữ tài liệu đã biết.
- Bạn có thể nhắm đến các trang cụ thể bằng cách dùng phạm vi (`"1-3"`), danh sách ngăn cách bằng dấu phẩy (`"1,3,5"`), hoặc `"all"` cho mọi trang.
- Một yêu cầu có thể xử lý tối đa 50 trang. Dữ liệu đầu rasterized được giới hạn ở 512 MiB và phản hồi UTF-8 OCR tổng hợp được giới hạn ở 1.000.000 byte; công việc vượt quá giới hạn sẽ thất bại thay vì trả về một phần văn bản.
- Đối với các PDF đã chứa văn bản có thể chọn được, hãy cân nhắc dùng công cụ [PDF to Text](./pdf-to-text) nhanh hơn thay thế.
