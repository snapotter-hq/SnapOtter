---
description: "Chuyển đổi giữa các định dạng bản trình bày PowerPoint và OpenDocument."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 15270dd989fc
---

# Convert Presentation {#convert-presentation}

Chuyển đổi bản trình bày giữa các định dạng PowerPoint (PPTX) và OpenDocument Presentation (ODP).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Nhận dữ liệu multipart form với một tệp PowerPoint/ODP và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Định dạng đầu ra: `pptx`, `odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## Example Response {#example-response}

Trả về `202 Accepted`. Theo dõi tiến trình qua SSE tại `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Các định dạng đầu vào được chấp nhận: `.pptx`, `.ppt`, `.odp`.
- Việc chuyển đổi được xử lý bởi LibreOffice chạy ở chế độ headless trên máy chủ.
- Hiệu ứng hoạt ảnh và chuyển cảnh có thể không được giữ nguyên giữa các định dạng.
- Định dạng đầu ra phải khác với định dạng đầu vào.
