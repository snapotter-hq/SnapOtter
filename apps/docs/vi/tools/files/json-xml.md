---
description: "Chuyển đổi giữa JSON và XML, cả hai chiều."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: 75382ab82035
---

# JSON to XML {#json-to-xml}

Chuyển đổi giữa các định dạng JSON và XML theo cả hai chiều. Tải lên tệp JSON để nhận XML, hoặc tải lên tệp XML để nhận JSON.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

Nhận dữ liệu multipart form với một tệp JSON hoặc XML và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | In đẹp đầu ra với thụt lề |

## Example Request {#example-request}

JSON sang XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML sang JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notes {#notes}

- Chiều chuyển đổi được tự động phát hiện từ phần mở rộng tệp đầu vào: `.json` tạo ra `.xml`, còn `.xml` tạo ra `.json`.
- Tham số `pretty` áp dụng cho cả hai chiều. Khi `false`, đầu ra gọn không có thụt lề.
- Các thuộc tính XML và cấu trúc lồng nhau được giữ nguyên trong quá trình chuyển đổi khứ hồi nếu có thể.
