---
description: "एक PDF से टेक्स्ट occurrences को स्थायी रूप से हटाएं (सत्यापित सच्ची रिडैक्शन)।"
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: 45416a029bfd
---

# Redact PDF {#redact-pdf}

सत्यापित सच्ची रिडैक्शन का उपयोग करके एक PDF से निर्दिष्ट टेक्स्ट occurrences को स्थायी रूप से हटाएं। रिडैक्ट किया गया टेक्स्ट फ़ाइल से पूरी तरह हटा दिया जाता है, न कि केवल एक काले बॉक्स से ढका जाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| terms | string[] | Yes | - | रिडैक्ट करने के लिए टेक्स्ट स्ट्रिंग (1-50 शब्द, प्रत्येक 200 अक्षरों तक) |
| caseSensitive | boolean | No | `false` | क्या मिलान केस-संवेदनशील है |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- स्वीकृत इनपुट फ़ॉर्मेट: `.pdf`।
- यह एक फ़ास्ट (सिंक्रोनस) टूल है जो परिणाम सीधे लौटाता है।
- यह सच्ची रिडैक्शन करता है: मिलान किया गया टेक्स्ट PDF कंटेंट स्ट्रीम से हटा दिया जाता है, न कि केवल दृश्य रूप से छिपाया जाता है।
- रिस्पॉन्स में `found` फ़ील्ड दर्शाता है कि कितने occurrences रिडैक्ट किए गए।
- आप एक ही अनुरोध में 50 शब्दों तक को रिडैक्ट कर सकते हैं।
