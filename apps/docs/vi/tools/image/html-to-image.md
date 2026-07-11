---
description: "Chụp trang web hoặc đoạn HTML thành ảnh chất lượng cao với chế độ giả lập thiết bị."
i18n_source_hash: 1e49d070ea2e
i18n_provenance: human
i18n_output_hash: 3e6f734271bb
---

# HTML sang ảnh {#html-to-image}

Chụp một URL trang web hoặc nội dung HTML thô thành ảnh chụp màn hình. Hỗ trợ giả lập thiết bị (desktop, tablet, mobile), chụp toàn trang và nhiều định dạng đầu ra.

## Điểm cuối API {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Chấp nhận một **thân JSON** (không phải multipart). Không cần tải lên tệp.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| url | string | Có điều kiện | - | URL cần chụp (phải là một URL hợp lệ) |
| html | string | Có điều kiện | - | Nội dung HTML thô để kết xuất (1 đến 5.000.000 ký tự) |
| format | string | Không | `"png"` | Định dạng đầu ra: `jpg`, `png`, `webp` |
| quality | number | Không | `90` | Chất lượng đầu ra cho các định dạng mất dữ liệu (1 đến 100) |
| fullPage | boolean | Không | `false` | Chụp toàn bộ trang có thể cuộn, không chỉ khung nhìn |
| devicePreset | string | Không | `"desktop"` | Giả lập thiết bị: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | Không | `1280` | Chiều rộng khung nhìn tùy chỉnh tính bằng pixel (320 đến 3840, dùng khi devicePreset là `custom`) |
| viewportHeight | number | Không | `720` | Chiều cao khung nhìn tùy chỉnh tính bằng pixel (320 đến 2160, dùng khi devicePreset là `custom`) |

Phải cung cấp `url` hoặc `html`, nhưng không phải cả hai.

### Cấu hình thiết bị dựng sẵn {#device-presets}

| Cấu hình | Chiều rộng | Chiều cao | UA di động |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | Không |
| `tablet` | 768 | 1024 | Không |
| `mobile` | 375 | 812 | Có |
| `custom` | (người dùng chỉ định) | (người dùng chỉ định) | Không |

## Ví dụ yêu cầu {#example-request}

Chụp một trang web:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

Kết xuất nội dung HTML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

## Ghi chú {#notes}

- Yêu cầu Chromium được cài đặt trên máy chủ. Trả về HTTP 503 nếu dịch vụ trình duyệt không khả dụng.
- Các URL được kiểm tra chống lại tấn công SSRF (các địa chỉ mạng riêng/nội bộ bị chặn).
- Điểm cuối này bị giới hạn tốc độ ở mức 120 yêu cầu mỗi giờ.
- `originalSize` luôn là 0 vì công cụ này tạo ảnh từ URL/HTML.
- Tên tệp đầu ra là `screenshot.<format>`.
- Nếu trang mất quá nhiều thời gian để tải, yêu cầu trả về HTTP 504 (gateway timeout).
- Nếu dịch vụ trình duyệt liên tục gặp sự cố, nó tạm thời bị vô hiệu hóa và trả về HTTP 503 với mã `BROWSER_CRASHED`.
