---
description: "Xóa metadata EXIF, GPS, ICC, và XMP khỏi ảnh để bảo vệ quyền riêng tư và giảm kích thước tệp."
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: 80a3f4fa0543
---

# Xóa siêu dữ liệu ảnh {#remove-metadata}

Xóa EXIF, GPS, hồ sơ màu ICC, và metadata XMP khỏi ảnh. Hữu ích cho quyền riêng tư (xóa tọa độ GPS, thông tin máy ảnh) và giảm kích thước tệp.

## Các API Endpoint {#api-endpoints}

### Xóa Metadata {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

Xử lý ảnh và trả về phiên bản đã làm sạch với metadata được chọn đã bị xóa.

### Kiểm tra Metadata {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

Trả về metadata đã phân tích dưới dạng JSON mà không sửa đổi ảnh. Hữu ích để xem trước metadata nào đang tồn tại trước khi xóa.

## Tham số (Xóa) {#parameters-strip}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | Không | `false` | Xóa dữ liệu EXIF (thiết lập máy ảnh, ngày tháng, v.v.) |
| stripGps | boolean | Không | `false` | Chỉ xóa dữ liệu GPS/vị trí |
| stripIcc | boolean | Không | `false` | Xóa hồ sơ màu ICC |
| stripXmp | boolean | Không | `false` | Xóa metadata XMP (Adobe, IPTC) |
| stripAll | boolean | Không | `true` | Xóa toàn bộ metadata cùng lúc |

Khi `stripAll` là `true`, nó ghi đè các cờ riêng lẻ và xóa mọi thứ.

## Ví dụ Request {#example-request}

Xóa toàn bộ metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Chỉ xóa dữ liệu GPS (giữ thông tin máy ảnh và hồ sơ màu):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Kiểm tra metadata mà không sửa đổi:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Ví dụ Response (Xóa) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Ví dụ Response (Kiểm tra) {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## Ghi chú {#notes}

- Ảnh được mã hóa lại theo định dạng gốc sau khi xóa. JPEG dùng mozjpeg ở chất lượng 90, PNG dùng mức nén 9, WebP dùng chất lượng 85.
- Xóa hồ sơ ICC có thể gây ra thay đổi màu nhẹ nếu ảnh được gắn hồ sơ không phải sRGB. Dùng `stripIcc: false` nếu độ chính xác màu quan trọng.
- Endpoint kiểm tra phân tích tọa độ GPS thành giá trị vĩ độ/kinh độ thập phân (có tiền tố gạch dưới) để tiện lợi.
- Định dạng đầu vào được hỗ trợ: JPEG, PNG, WebP, AVIF, TIFF, GIF.
