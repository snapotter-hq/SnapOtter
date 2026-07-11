---
description: "Trích xuất văn bản từ ảnh bằng nhận dạng ký tự quang học do AI hỗ trợ."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: e7f8586af130
---

# OCR / Text Extraction {#ocr-text-extraction}

Trích xuất văn bản từ ảnh bằng nhận dạng ký tự quang học do AI hỗ trợ. Hỗ trợ nhiều ngôn ngữ và cấp chất lượng.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Processing:** Phản hồi JSON đồng bộ. Nếu `clientJobId` được cung cấp, tiến trình cũng được báo cáo qua SSE.

**Model bundle:** `ocr` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Tệp ảnh (multipart) |
| quality | string | No | `"balanced"` | Cấp chất lượng: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | No | `"auto"` | Gợi ý ngôn ngữ: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | No | `true` | Tiền xử lý ảnh để OCR chính xác hơn |
| engine | string | No | - | Đã lỗi thời. Dùng `quality` thay thế. Ánh xạ `tesseract` thành `fast`, `paddleocr` thành `balanced` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Progress (SSE, optional) {#progress-sse-optional}

Nếu trường form `clientJobId` được cung cấp, các sự kiện tiến trình sẽ được truyền phát:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notes {#notes}

- Yêu cầu cài đặt model bundle `ocr` (5-6 GB).
- OCR trả về văn bản đã trích xuất trực tiếp thay vì một URL tải ảnh xuống.
- Sử dụng chuỗi dự phòng: nếu một cấp chất lượng cao hơn bị lỗi (ví dụ: PaddleOCR segfault), nó sẽ tự động thử lại với cấp thấp hơn kế tiếp.
- Nếu một cấp trả về văn bản rỗng mà không bị lỗi, nó cũng sẽ chuyển sang cấp kế tiếp.
- Các cấp chất lượng ánh xạ tới các engine: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Hỗ trợ các định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR và HDR thông qua giải mã tự động.
