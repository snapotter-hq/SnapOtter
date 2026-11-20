---
description: "Ghép nhiều tệp văn bản hoặc Markdown thành một, theo thứ tự bạn chọn."
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: 0a5baff81841
i18n_hash_version: 2
---

# Ghép tệp văn bản {#merge-text}

Ghép nhiều tệp văn bản hoặc Markdown thành một tệp duy nhất. Các tệp được nối theo thứ tự tải lên, vì vậy hãy sắp xếp lại trong danh sách tệp trước khi chạy nếu thứ tự quan trọng.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

Nhận dữ liệu biểu mẫu multipart với hai tệp văn bản trở lên và một chuỗi JSON `settings` tùy chọn.

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | Nội dung chèn giữa các tệp: `"blank-line"`, `"rule"` (một dòng `---`) hoặc `"filename-heading"` (tên của từng tệp làm tiêu đề) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Notes {#notes}

- Chấp nhận các tệp `.txt`, `.md`, `.markdown`, `.csv` và `.log`, từ 2 đến 50 tệp mỗi yêu cầu.
- Mọi tệp phải là văn bản UTF-8. Tệp nhị phân hoặc không phải UTF-8 sẽ bị từ chối và tên tệp xuất hiện trong lỗi.
- Khi mọi đầu vào có cùng phần mở rộng, đầu ra giữ nguyên phần mở rộng đó (`merged.md`, `merged.log`). Đầu vào hỗn hợp tạo ra `merged.txt`.
- Với `filename-heading`, đầu ra Markdown dùng tiêu đề `# name.md`; đầu ra văn bản thuần dùng các dòng đánh dấu `==> name.txt <==`.
- Các dòng trống ở cuối mỗi tệp được cắt bỏ để dấu phân cách nằm gọn giữa các tài liệu. Dấu thứ tự byte (BOM) ở đầu tệp sẽ bị bỏ.
- Các tệp CSV được nối như văn bản thuần. Dùng [Merge CSVs](./merge-csvs) để gộp các bảng với một hàng tiêu đề duy nhất.
- Tệp email `.eml` chưa được hỗ trợ.
