---
description: "Tạo một ảnh giữ chỗ chất lượng thấp cực nhỏ với data URI base64."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: d4af6608825f
---

# Ảnh giữ chỗ LQIP {#lqip-placeholder}

Tạo một ảnh giữ chỗ chất lượng thấp cực nhỏ (LQIP) từ một ảnh nguồn. Trả về một tệp giữ chỗ nhỏ cùng với một data URI base64, thẻ HTML `<img>` sẵn sàng dùng, và đoạn CSS `background-image` để nhúng ngay lập tức.

## Điểm cuối API {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| width | integer | Không | `16` | Chiều rộng đích tính bằng pixel (4-64) |
| blur | number | Không | `2` | Bán kính làm mờ cho chiến lược blur (0-20) |
| strategy | string | Không | `"blur"` | Chiến lược giữ chỗ: `blur`, `pixelate`, hoặc `solid` |
| format | string | Không | `"webp"` | Định dạng đầu ra: `webp`, `png`, hoặc `jpeg` |
| quality | integer | Không | `50` | Chất lượng đầu ra (1-100) |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Ghi chú {#notes}

- Trường `dataUri` chứa data URI hoàn chỉnh, sẵn sàng dùng trong các thuộc tính `src` hoặc CSS mà không cần yêu cầu bổ sung nào.
- Các trường `html` và `css` cung cấp các đoạn sao-chép-dán cho các trường hợp dùng phổ biến.
- Chiến lược `blur` tạo ra một thumbnail mềm, mờ. Chiến lược `pixelate` tạo ra một khảm ô vuông. Chiến lược `solid` trả về một màu trung bình duy nhất.
- Kích thước giữ chỗ điển hình là 200-500 byte, khiến chúng phù hợp để nhúng trực tiếp trong HTML.
- Chiều cao được tính tự động để giữ tỷ lệ khung hình của ảnh nguồn.
- Đầu vào HEIC, RAW, PSD và SVG được giải mã tự động trước khi xử lý.
