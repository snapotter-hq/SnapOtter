---
description: "Chuyển đổi giữa YAML và JSON, cả hai chiều."
i18n_source_hash: ef0c9b633797
i18n_provenance: human
i18n_output_hash: e960d9244e1a
---

# Chuyển đổi YAML / JSON {#yaml-json}

Chuyển đổi giữa các định dạng YAML và JSON theo cả hai chiều. Tải lên một tệp YAML để nhận JSON, hoặc tải lên một tệp JSON để nhận YAML.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp YAML hoặc JSON. Không cần trường settings.

## Parameters {#parameters}

Công cụ này không có tham số nào có thể cấu hình. Chiều chuyển đổi được xác định bởi phần mở rộng của tệp đầu vào.

## Example Request {#example-request}

YAML sang JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON sang YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Notes {#notes}

- Chiều chuyển đổi được tự động phát hiện từ phần mở rộng của tệp đầu vào: `.yaml` hoặc `.yml` tạo ra `.json`, và `.json` tạo ra `.yaml`.
- Cả hai phần mở rộng `.yaml` và `.yml` đều được chấp nhận.
- Chỉ tài liệu đầu tiên trong một tệp YAML nhiều tài liệu được chuyển đổi; các tài liệu bổ sung được phân tách bởi `---` sẽ bị bỏ qua.
