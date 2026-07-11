---
description: "PDF के हर पृष्ठ पर पृष्ठ संख्या जोड़ें।"
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 470e68934563
---

# PDF Page Numbers {#pdf-page-numbers}

PDF के हर पृष्ठ पर "Page N of M" पृष्ठ संख्या जोड़ें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bc"` | पृष्ठ संख्या का स्थान: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | No | `10` | पॉइंट में फ़ॉन्ट आकार (6-24) |

### Position Values {#position-values}

- `tl` ऊपर-बाएं, `tc` ऊपर-केंद्र, `tr` ऊपर-दाएं
- `bl` नीचे-बाएं, `bc` नीचे-केंद्र, `br` नीचे-दाएं

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- पृष्ठ संख्याएं "Page 1 of 10" फ़ॉर्मेट में रेंडर की जाती हैं।
- संख्याएं हर पृष्ठ पर जोड़ी जाती हैं, जिसमें कोई भी मौजूदा शीर्षक या कवर पृष्ठ शामिल है।
- डिफ़ॉल्ट स्थिति `"bc"` प्रत्येक पृष्ठ के नीचे-केंद्र में संख्याएं रखती है।
