---
description: "Trích xuất văn bản từ hình ảnh cục bộ bằng Tesseract tích hợp sẵn hoặc thời gian chạy RapidOCR có độ chính xác cao tùy chọn."
i18n_output_hash: 583a45347d7f
i18n_source_hash: 0d453b49db02
i18n_provenance: human
---

# OCR / Text Extraction {#ocr-text-extraction}

Trích xuất văn bản từ hình ảnh mà không gửi hình ảnh đến dịch vụ bên ngoài. Tầng `fast` tích hợp sử dụng Tesseract. Các tầng `balanced` và `best` tùy chọn sử dụng RapidOCR với các mẫu PP-OCR ONNX được ghim.


<!-- korean-ocr-contract:start -->
::: info Khả năng tương thích OCR tiếng Hàn
OCR Nhanh hỗ trợ `auto`, `en`, `de`, `es`, `fr`, `zh` và `ja`, nhưng không hỗ trợ tiếng Hàn (`ko`). Tiếng Hàn cần gói OCR Chính xác và `balanced` hoặc `best`. Gói chạy trên container Linux amd64 và arm64 chính thức, kể cả máy chủ NVIDIA nơi OCR vẫn chạy bằng CPU. Hệ thống không được hỗ trợ sẽ trả về lỗi tương thích rõ ràng và không âm thầm chuyển về `fast`. Tiếng Hàn với `fast` hoặc bí danh cũ `tesseract` bị từ chối trước khi xếp hàng với `FEATURE_INCOMPATIBLE` và `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Xử lý:** OCR luôn chạy bất đồng bộ. Sau khi xác thực và đưa công việc vào hàng đợi, endpoint lập tức trả về `202 Accepted` cùng `jobId`. Theo dõi luồng tiến trình SSE của công việc đến sự kiện cuối `complete` hoặc `failed`; `result` của sự kiện thành công chứa các trường OCR.

**Gói OCR chính xác:** Thời gian chạy `ocr` tùy chọn (khoảng 208-234 MiB để tải xuống và 409-488 MiB đã cài đặt, tùy thuộc vào mục tiêu). `fast` không yêu cầu gói này; trình cài đặt xác minh kích thước chính xác được giới hạn bởi chỉ mục đã ký.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Đúng | - | Tệp hình ảnh (nhiều phần), được mã hóa lên tới 512 MiB và giải mã 40 megapixel; giới hạn tải lên của nhà điều hành thấp hơn vẫn được áp dụng |
| quality | string | KHÔNG | Năng động | Cấp chất lượng: `fast` (Tesseract), `balanced` (RapidOCR với các mẫu PP-OCRv6 nhỏ) hoặc `best` (các mẫu PP-OCRv6 trung bình có độ chính xác cao hơn với tính năng chấm điểm biến thể đã hiệu chỉnh) |
| language | string | No | `"auto"` | Gợi ý ngôn ngữ: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | KHÔNG | Phụ thuộc vào cấp bậc | Cải thiện độ tương phản cục bộ trước khi nhận dạng. Nhanh chóng áp dụng nó trực tiếp; Cân bằng và Tốt nhất chỉ giữ lại biến thể khi việc tính điểm đã hiệu chỉnh cải thiện kết quả. Mặc định là `true` cho `best` và `false` cho `fast`/`balanced` |
| engine | string | KHÔNG | - | Bí danh tương thích không được dùng nữa. Thay vào đó hãy sử dụng `quality`. `tesseract` ánh xạ tới `fast`; giá trị `paddleocr` kế thừa ánh xạ tới `balanced` nhưng không tải PaddlePaddle |

Khi bỏ qua `quality` và `engine`, SnapOtter chọn cấp tốt nhất hiện có theo thứ tự `best`, `balanced`, `fast`. Với tiếng Hàn, hệ thống không bao giờ chọn `fast`; hệ thống dùng `best`, sau đó `balanced`, hoặc trả về lỗi cài đặt hay tương thích của runtime chính xác.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Phản hồi đã chấp nhận (202) {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Tiến trình và kết quả (SSE) {#progress-sse-optional}

Kết nối tới `GET /api/v1/jobs/{jobId}/progress` bằng `jobId` do phản hồi `202` trả về (hoặc `clientJobId` đã cung cấp). Giữ luồng mở cho đến sự kiện cuối `complete` hoặc `failed`. Frame cuối thành công chứa kết quả OCR trong `result`:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "single",
  "phase": "complete",
  "stage": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_ocr.txt",
    "originalSize": 12345,
    "processedSize": 47,
    "text": "Extracted text content from the image...",
    "engine": "rapidocr-onnx",
    "requestedQuality": "best",
    "actualQuality": "best",
    "device": "cpu",
    "provider": "CPUExecutionProvider",
    "degraded": false,
    "warnings": [],
    "runtimeVersion": "2.1.0",
    "modelVersion": "PP-OCRv6-best-v1-medium"
  }
}
```

Lỗi xử lý được gửi trong trường `error` của sự kiện cuối `failed`; sau khi đưa vào hàng đợi, lỗi không được trả về dưới dạng HTTP `422`.

## Notes {#notes}

- `fast` luôn có sẵn trong hỗ trợ SnapOtter hình ảnh. `balanced` Và `best` yêu cầu chính xác tùy chọn OCR đóng gói.
- Tích hợp sẵn Tesseract thêm khoảng 25 MiB đến hình ảnh chính thức. Gói chính xác được lưu trữ trong `/data/ai`, không được nướng vào hình ảnh.
- Gói chính xác được xuất bản cho các thùng chứa Linux amd64 và arm64 chính thức. Nó cố tình sử dụng nhà cung cấp CPU của ONNX Runtime, bao gồm cả trên máy chủ NVIDIA, vì vậy nó không phụ thuộc vào thư viện CUDA hoặc khả năng tương thích GPU. Các bản cài đặt bare-metal nguồn và dựng sẵn sử dụng Fast OCR trừ khi chúng cung cấp thời gian chạy tương thích của riêng chúng.
- `result` cuối thành công bao gồm cả văn bản đã trích xuất trong `text` và tệp `.txt` có thể tải xuống trong `downloadUrl`.
- SnapOtter tôn vinh cấp độ được yêu cầu rõ ràng. Nếu `balanced` hoặc `best` không có sẵn thì API trả về `501` với `FEATURE_NOT_INSTALLED` hoặc `FEATURE_INCOMPATIBLE`; nó không bao giờ âm thầm hạ cấp yêu cầu xuống cấp khác.
- Kết quả trống thành công vẫn là kết quả trống. Lỗi thời gian chạy sẽ trả về lỗi thay vì thử lại bằng công cụ có chất lượng thấp hơn.
- `result` cuối thành công báo cáo cả `requestedQuality` và `actualQuality`, cùng với các phiên bản động cơ, thiết bị, nhà cung cấp, thời gian chạy và kiểu máy cũng như mọi cảnh báo.
- Hỗ trợ các định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR và HDR thông qua giải mã tự động.
- Đầu vào được mã hóa quá khổ trả về `413`. Hình ảnh trên 40 megapixel và phản hồi của OCR vượt quá giới hạn đầu ra giới hạn của chúng sẽ bị từ chối thay vì được xử lý một phần.
