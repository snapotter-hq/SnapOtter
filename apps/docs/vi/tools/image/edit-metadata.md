---
description: "Chỉnh sửa các trường metadata EXIF, IPTC, GPS và XMP trong ảnh mà không mã hóa lại pixel."
i18n_source_hash: a37746db11c3
i18n_provenance: human
i18n_output_hash: 2a197547d5bd
---

# Chỉnh sửa metadata {#edit-metadata}

Chỉnh sửa các trường metadata của ảnh bao gồm EXIF, IPTC, tọa độ GPS, ngày tháng và từ khóa. Sử dụng ExifTool bên dưới, nên metadata được ghi tại chỗ mà không mã hóa lại pixel, giữ nguyên chất lượng ảnh đầy đủ.

## API Endpoints {#api-endpoints}

### Chỉnh sửa metadata {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

Ghi các trường metadata vào ảnh và trả về tệp đã sửa đổi.

### Kiểm tra metadata {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

Trả về toàn bộ metadata từ ảnh qua ExifTool dưới dạng JSON. Không sửa đổi ảnh.

## Tham số (Chỉnh sửa) {#parameters-edit}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| title | string | Không | - | Tiêu đề ảnh (XMP/EXIF) |
| author | string | Không | - | Tên tác giả |
| artist | string | Không | - | Tên nghệ sĩ (thẻ EXIF Artist) |
| copyright | string | Không | - | Thông báo bản quyền |
| imageDescription | string | Không | - | Mô tả ảnh (EXIF) |
| software | string | Không | - | Thẻ phần mềm |
| dateTime | string | Không | - | Giá trị EXIF DateTime |
| dateTimeOriginal | string | Không | - | Giá trị EXIF DateTimeOriginal |
| setAllDates | string | Không | - | Đặt tất cả các trường ngày cùng lúc |
| dateShift | string | Không | - | Dịch tất cả các ngày theo độ lệch (định dạng: `+HH:MM` hoặc `-HH:MM`) |
| clearGps | boolean | Không | `false` | Xóa toàn bộ dữ liệu GPS |
| gpsLatitude | number | Không | - | Đặt vĩ độ GPS (-90 đến 90) |
| gpsLongitude | number | Không | - | Đặt kinh độ GPS (-180 đến 180) |
| gpsAltitude | number | Không | - | Đặt độ cao GPS tính bằng mét |
| keywords | string[] | Không | - | Từ khóa/thẻ cần thêm hoặc đặt |
| keywordsMode | string | Không | `"add"` | Cách xử lý từ khóa: `add` (thêm vào) hoặc `set` (thay thế) |
| fieldsToRemove | string[] | Không | `[]` | Danh sách tên các trường metadata cụ thể cần xóa |
| iptcTitle | string | Không | - | IPTC Object Name |
| iptcHeadline | string | Không | - | IPTC Headline |
| iptcCity | string | Không | - | IPTC City |
| iptcState | string | Không | - | IPTC Province/State |
| iptcCountry | string | Không | - | IPTC Country |

## Ví dụ yêu cầu {#example-request}

Đặt tác giả và bản quyền:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

Đặt tọa độ GPS:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

Xóa GPS và thêm từ khóa:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Kiểm tra metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Ví dụ phản hồi (Chỉnh sửa) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Ghi chú {#notes}

- Công cụ này yêu cầu cài đặt ExifTool trên máy chủ. Nó đã được bao gồm trong image Docker.
- Metadata được ghi tại chỗ, nên không có việc mã hóa lại pixel. Thay đổi kích thước tệp là tối thiểu (chỉ các byte metadata).
- Tham số `dateShift` dịch tất cả các trường ngày theo độ lệch chỉ định, hữu ích để sửa lỗi múi giờ (ví dụ `+02:00` hoặc `-05:30`).
- Nếu không yêu cầu thay đổi nào (tất cả tham số bị bỏ hoặc để trống), tệp gốc được trả về không thay đổi.
- Định dạng được hỗ trợ: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- Với các định dạng không xem trước được trên trình duyệt (HEIF, TIFF), phản hồi bao gồm một trường `previewUrl` với bản xem trước WebP.
