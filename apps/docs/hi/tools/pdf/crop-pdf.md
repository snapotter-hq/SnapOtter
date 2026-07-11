---
description: "एक समान मार्जिन के साथ PDF के सभी पृष्ठों को क्रॉप करें।"
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: db8529e194d1
---

# Crop PDF {#crop-pdf}

एक समान मार्जिन लागू करके PDF के सभी पृष्ठों को क्रॉप करें, प्रत्येक किनारे से सामग्री को समान रूप से ट्रिम करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| margin | number | No | `20` | पॉइंट में एक समान क्रॉप मार्जिन (0-2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- मार्जिन मान PDF पॉइंट में होता है (1 पॉइंट = 1/72 इंच)।
- वही मार्जिन प्रत्येक पृष्ठ के चारों किनारों पर लागू किया जाता है।
- `0` का मार्जिन सभी मौजूदा क्रॉप मार्जिन हटा देता है, जिससे पूरा मीडिया बॉक्स दिखता है।
