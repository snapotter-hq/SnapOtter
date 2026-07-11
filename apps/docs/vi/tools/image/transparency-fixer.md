---
description: "Sửa các PNG trong suốt giả bằng AI matting (BiRefNet) để tạo alpha thật, cùng dọn dẹp cạnh defringe."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: 60606de5886b
---

# Trình sửa độ trong suốt PNG {#png-transparency-fixer}

Sửa các PNG trong suốt giả chỉ với một cú nhấp. Sử dụng AI matting (mô hình BiRefNet HR Matting) để tạo độ trong suốt alpha thật, với hậu xử lý defringe để dọn dẹp các cạnh.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Xử lý:** Bất đồng bộ (trả về 202, poll `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Gói mô hình:** `background-removal` (4-5 GB)

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| file | file | Có | - | Tệp ảnh (multipart) |
| defringe | number | Không | `30` | Cường độ defringe (0-100). Xóa các pixel viền bán trong suốt quanh các cạnh |
| outputFormat | string | Không | `"png"` | Định dạng đầu ra: `png` hoặc `webp` |
| removeWatermark | boolean | Không | `false` | Áp dụng tiền xử lý xóa watermark (bộ lọc trung vị) |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
```

## Response {#response}

### Response ban đầu (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Tiến trình (SSE tại `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Kết quả cuối cùng (qua SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Ghi chú {#notes}

- Yêu cầu gói mô hình `background-removal` được cài đặt (4-5 GB).
- Sử dụng `birefnet-hr-matting` làm mô hình chính cho alpha matting chất lượng cao. Chuyển về `birefnet-general` nếu mô hình HR hết bộ nhớ.
- Tùy chọn `defringe` xóa các pixel viền bán trong suốt mà AI matting đôi khi để lại quanh tóc, lông, và các cạnh mịn. Nó hoạt động bằng cách làm mờ kênh alpha và đưa về 0 các pixel có độ tin cậy thấp.
- Tùy chọn `removeWatermark` áp dụng bước tiền xử lý bộ lọc trung vị. Đây là cách giảm watermark cơ bản, không phải công cụ chuyên dụng để xóa watermark.
- Chỉ xuất ra PNG hoặc WebP không mất dữ liệu (cả hai đều hỗ trợ độ trong suốt alpha).
- Hỗ trợ các định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR, và HDR qua giải mã tự động.
