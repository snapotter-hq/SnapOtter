---
description: "एक PDF से पासवर्ड सुरक्षा हटाएं।"
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 9b907993cf84
---

# Unlock PDF {#unlock-pdf}

सही पासवर्ड प्रदान करके एक एन्क्रिप्टेड PDF से पासवर्ड सुरक्षा हटाएं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| password | string | Yes | - | PDF को डिक्रिप्ट करने के लिए पासवर्ड (1-256 अक्षर) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- सही पासवर्ड प्रदान किया जाना चाहिए; एक गलत पासवर्ड 400 त्रुटि लौटाता है।
- डिक्रिप्शन के लिए यूज़र पासवर्ड या ओनर पासवर्ड में से कोई भी काम करेगा।
- पासवर्ड ऑडिट लॉग से हटा दिए जाते हैं।
