---
description: "PowerPoint और OpenDocument प्रेजेंटेशन फ़ॉर्मेट के बीच कन्वर्ट करें।"
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 42c529b5baab
---

# Convert Presentation {#convert-presentation}

प्रेजेंटेशन को PowerPoint (PPTX) और OpenDocument Presentation (ODP) फ़ॉर्मेट के बीच कन्वर्ट करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

एक PowerPoint/ODP फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | आउटपुट फ़ॉर्मेट: `pptx`, `odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## Example Response {#example-response}

`202 Accepted` लौटाता है। `/api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति को ट्रैक करें।

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- स्वीकृत इनपुट फ़ॉर्मेट: `.pptx`, `.ppt`, `.odp`।
- कन्वर्ज़न सर्वर पर headless चल रहे LibreOffice द्वारा नियंत्रित किया जाता है।
- एनिमेशन और ट्रांज़िशन प्रभाव फ़ॉर्मेट के बीच संरक्षित न रह सकते हैं।
- आउटपुट फ़ॉर्मेट इनपुट फ़ॉर्मेट से भिन्न होना चाहिए।
