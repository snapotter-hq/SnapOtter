---
description: "एक PDF से विशिष्ट पृष्ठ हटाएं।"
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 254ea06cb5ec
---

# Remove Pages {#remove-pages}

एक PDF से विशिष्ट पृष्ठ हटाएं, बाकी सभी पृष्ठों को अक्षुण्ण रखते हुए।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pages | string | Yes | - | qpdf सिंटैक्स में हटाने के लिए पृष्ठ रेंज, उदा. `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- आप किसी दस्तावेज़ से हर पृष्ठ नहीं हटा सकते; कम से कम एक पृष्ठ बचा रहना चाहिए।
- पृष्ठ रेंज qpdf सिंटैक्स का उपयोग करती हैं: एकल पृष्ठ के लिए `3`, रेंज के लिए `5-7`, और संयोजित करने के लिए कॉमा (उदा. `1,3,5-7`)।
