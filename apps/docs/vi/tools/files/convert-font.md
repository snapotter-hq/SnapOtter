---
description: "Chuyển đổi phông chữ giữa TTF, OTF, WOFF và WOFF2."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: e9d56ef84f55
i18n_hash_version: 2
---

# Chuyển đổi phông chữ {#convert-font}

Chuyển đổi một tệp phông chữ giữa TrueType (TTF), OpenType CFF (OTF), WOFF và WOFF2. Dùng công cụ này để biến phông chữ máy tính thành phông chữ web, hoặc lấy TTF từ OTF cho một ứng dụng chỉ nhận TrueType.

## Điểm cuối API {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp `.ttf`, `.otf`, `.woff` hoặc `.woff2` và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| format | string | Không | `ttf` | Định dạng đầu ra: `ttf`, `otf`, `woff` hoặc `woff2` |

## Ví dụ yêu cầu {#example-request}

OTF sang TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF sang WOFF2 cho web:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Ghi chú {#notes}

- WOFF và WOFF2 là lớp bọc nén quanh cùng một dữ liệu phông chữ, nên chuyển đổi sang hoặc từ các định dạng này giữ nguyên đường viền.
- OTF sang TTF chuyển các đường cong bậc ba (CFF) thành đường cong bậc hai TrueType. Mỗi đường cong lệch khỏi bản gốc không quá 1 đơn vị phông chữ, điều này không thể thấy ở kích thước bình thường, nhưng phép chuyển đổi không thể đảo ngược chính xác. TTF sang OTF giữ nguyên hình dạng đường cong và chỉ làm tròn các điểm điều khiển về đơn vị phông chữ nguyên.
- Quyền nhúng của phông chữ (trường OS/2 `fsType`) được giữ nguyên.
- Không hỗ trợ bộ sưu tập phông chữ (`.ttc`). Phông chữ TrueType biến thiên không thể chuyển sang OTF, và phông chữ CFF2 biến thiên không thể chuyển sang TTF; hãy chuyển chúng sang WOFF hoặc WOFF2.
- Việc chuyển đổi chạy trong worker tài liệu Python với cùng thời gian chờ như các công cụ tài liệu khác, không chạy trong tiến trình API.
