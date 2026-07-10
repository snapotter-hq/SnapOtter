---
description: "Đệm một ảnh về tỷ lệ khung hình đích với nền màu đặc, trong suốt hoặc mờ."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: dada7ed352ac
---

# Đệm ảnh {#image-pad}

Đệm một ảnh về tỷ lệ khung hình đích bằng cách thêm nền màu đặc, trong suốt hoặc mờ xung quanh nó. Hữu ích để đưa ảnh vào các tỷ lệ khung hình cố định cho mạng xã hội hoặc in ấn mà không cần cắt.

## Điểm cuối API {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| target | string | Không | `"1:1"` | Tỷ lệ khung hình đích: `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, hoặc `custom` |
| ratioW | integer | Không | `1` | Chiều rộng tỷ lệ tùy chỉnh (1-100, dùng khi target là `custom`) |
| ratioH | integer | Không | `1` | Chiều cao tỷ lệ tùy chỉnh (1-100, dùng khi target là `custom`) |
| background | string | Không | `"color"` | Chế độ nền: `color`, `transparent`, hoặc `blur` |
| color | string | Không | `"#ffffff"` | Màu nền dạng hex (khi background là `color`) |
| padding | integer | Không | `0` | Khoảng đệm bổ sung tính theo phần trăm canvas (0-50) |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Ghi chú {#notes}

- Chế độ nền `blur` tạo một bản sao mờ của ảnh gốc làm phần đệm lấp đầy, cho ra kết quả gắn kết về mặt hình ảnh.
- Khi dùng nền `transparent`, đầu ra được chuyển sang PNG để giữ kênh alpha.
- Định dạng đầu ra khớp với định dạng đầu vào trừ khi có liên quan đến độ trong suốt. Đầu vào HEIC, RAW, PSD và SVG được giải mã tự động trước khi xử lý.
- Đặt `target` thành `custom` và cung cấp `ratioW` và `ratioH` cho các tỷ lệ khung hình tùy ý (ví dụ, `ratioW: 3, ratioH: 2` cho 3:2).
