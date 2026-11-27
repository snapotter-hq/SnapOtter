---
description: "Biến một tập ảnh thành video trình chiếu, ảnh GIF động hoặc ảnh WebP động."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: 66de6143ba1b
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

Biến một tập ảnh thành video trình chiếu với thời lượng mỗi ảnh, độ phân giải và tốc độ khung hình có thể cấu hình, hoặc thành ảnh GIF hay WebP động với thời gian cố định cho mỗi khung hình và số lần lặp.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Nhận multipart form data gồm hai hoặc nhiều file ảnh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | Định dạng đầu ra: `mp4`, `gif`, `webp` |
| secondsPerImage | number | No | `2` | Chỉ MP4. Thời lượng hiển thị mỗi ảnh tính bằng giây (0.5-10) |
| resolution | string | No | `"720p"` | Chỉ MP4. Độ phân giải đầu ra: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Chỉ MP4. Tốc độ khung hình đầu ra (10-60) |
| frameDelayMs | integer | No | `500` | Chỉ GIF và WebP. Thời gian hiển thị mỗi ảnh, tính bằng mili giây (20-10000) |
| loop | integer | No | `0` | Chỉ GIF và WebP. Số lần ảnh động phát; `0` là lặp vô hạn (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

Để tạo ảnh GIF động hiển thị mỗi ảnh trong 200 ms:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Chấp nhận 2-60 file ảnh mỗi yêu cầu. Các ảnh xuất hiện trong video theo thứ tự tải lên.
- Với MP4, ảnh được đổi kích thước và thêm viền đệm để vừa với độ phân giải mục tiêu trong khi giữ nguyên tỷ lệ khung hình.
- Tùy chọn độ phân giải `square` tạo ra video 1080x1080, hữu ích cho mạng xã hội.
- Đầu ra MP4 dùng H.264, có tên `slideshow.mp4`.
- Đầu ra GIF và WebP dùng kích thước của ảnh đầu tiên. Các ảnh có kích thước khác được thu nhỏ cho vừa bên trong, và vùng còn trống là trong suốt. Tệp có tên `slideshow.gif` hoặc `slideshow.webp`.
- GIF lưu thời gian khung hình theo phần trăm giây, nên `frameDelayMs` được làm tròn đến 10 ms gần nhất trong GIF. WebP giữ nguyên giá trị chính xác.
- Các ảnh động quá lớn sẽ bị từ chối thay vì được tạo: kích thước khung hình nhân với số ảnh phải nằm dưới cùng giới hạn điểm ảnh mà các công cụ GIF dùng.
