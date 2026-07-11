---
description: "Thêm hình mờ văn bản vào mọi trang của một PDF."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: 50bec810750c
---

# Watermark PDF {#watermark-pdf}

Đóng dấu một hình mờ văn bản trên mọi trang của một PDF với vị trí, kích thước, độ mờ đục và góc xoay có thể cấu hình.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| text | string | Có | - | Văn bản hình mờ (1-200 ký tự) |
| position | string | Không | `"c"` | Vị trí trên trang: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | Không | `48` | Cỡ chữ tính bằng điểm (6-72) |
| opacity | number | Không | `0.3` | Độ mờ đục của hình mờ (0.05-1) |
| rotation | number | Không | `45` | Góc xoay tính bằng độ (-180 đến 180) |

### Position Values {#position-values}

- `tl` trên-trái, `tc` trên-giữa, `tr` trên-phải
- `l` giữa-trái, `c` giữa, `r` giữa-phải
- `bl` dưới-trái, `bc` dưới-giữa, `br` dưới-phải

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- Hình mờ được kết xuất dưới dạng lớp phủ văn bản trên mỗi trang.
- Cùng một văn bản hình mờ, vị trí và kiểu dáng được áp dụng đồng nhất cho tất cả các trang.
- Dùng các giá trị độ mờ đục thấp hơn (0.1-0.3) cho các hình mờ tinh tế không che khuất nội dung.
