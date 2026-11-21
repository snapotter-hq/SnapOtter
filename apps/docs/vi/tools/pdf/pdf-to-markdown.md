---
description: "Chuyển đổi PDF sang Markdown, giữ tiêu đề, danh sách và bảng khi PDF có sẵn."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 58df1cc1c25e
i18n_hash_version: 2
---

# PDF to Markdown {#pdf-to-markdown}

Biến PDF thành tệp Markdown để bạn đưa vào wiki, trang tĩnh hoặc pipeline LLM.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF.

## Parameters {#parameters}

Công cụ này không có tham số nào có thể cấu hình. Tải lên một PDF và nhận lại một tệp `.md`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

PDF lớn có thể mất nhiều thời gian hơn cửa sổ đồng bộ. Khi đó API trả lời bằng `202` kèm `jobId`, và bạn theo dõi tiến trình tại `/api/v1/jobs/{jobId}/progress`.

## Những gì được giữ lại {#what-gets-kept}

PDF lưu văn bản đã định vị chứ không lưu cấu trúc, nên bộ chuyển đổi tự suy ra cấu trúc:

- **Tiêu đề.** Các dòng ngắn có cỡ chữ lớn hơn rõ rệt so với phần thân sẽ trở thành tiêu đề từ `#` đến `######`, xếp hạng theo cỡ chữ trên toàn tài liệu.
- **Danh sách.** Các dòng bắt đầu bằng dấu đầu dòng hoặc số sẽ trở thành mục danh sách.
- **In đậm, in nghiêng và liên kết.** Được giữ nguyên trong dòng. Chỉ các liên kết `http`, `https` và `mailto` được giữ lại.
- **Bảng.** Bảng vẽ bằng đường kẻ sẽ ra thành bảng Markdown. Bảng chỉ căn chỉnh bằng khoảng trắng thường ra thành đoạn văn thường.

Hình ảnh bị loại bỏ. Bố cục nhiều cột và thiết kế trang khác thường chỉ được xử lý ở mức cố gắng tối đa, nên hãy kiểm tra đầu ra trước khi dựa vào nó.

## Notes {#notes}

- Định dạng đầu vào được chấp nhận: `.pdf`.
- Trường `chars` trong phản hồi là độ dài của đầu ra Markdown.
- PDF quét không có lớp văn bản để chuyển đổi. Công cụ từ chối nó với `422` và mã `NO_TEXT_LAYER` thay vì trả về tệp rỗng. Hãy dùng công cụ [PDF OCR](./ocr-pdf) cho các tệp đó.
- Để chuyển ngược lại, [Markdown sang PDF](../files/markdown-to-pdf), [Markdown sang DOCX](../files/markdown-to-docx) và [Markdown sang HTML](../files/markdown-to-html) đọc các tệp `.md`.
