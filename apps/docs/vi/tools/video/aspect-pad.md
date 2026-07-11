---
description: "Thêm các thanh màu đơn sắc để vừa với một tỷ lệ khung hình mục tiêu."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: 9fc281d6e853
---

# Aspect Pad {#aspect-pad}

Thêm các thanh letterbox hoặc pillarbox màu đơn sắc để đưa một video vừa vào một tỷ lệ khung hình mục tiêu mà không cắt xén.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp video và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| target | string | Không | `"9:16"` | Tỷ lệ khung hình mục tiêu: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | Không | `"#000000"` | Màu hex cho các thanh đệm (ví dụ `"#000000"` cho màu đen) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- Nếu video đã khớp với tỷ lệ khung hình mục tiêu, tệp được trả về không thay đổi.
- Dùng `9:16` cho các định dạng mạng xã hội dọc/khổ đứng (TikTok, Reels, Shorts).
- Để có đệm làm mờ thay vì màu đơn sắc, hãy dùng công cụ Blur Pad.
