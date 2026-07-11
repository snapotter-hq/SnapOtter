---
description: "एम्बेडेड इमेज को कंप्रेस करके PDF फ़ाइल का आकार घटाएं।"
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 7fa152a28c15
---

# Compress PDF {#compress-pdf}

एम्बेडेड इमेज को डाउनसैंपल करके PDF फ़ाइल का आकार कम करें। क्वालिटी स्लाइडर या लक्षित फ़ाइल आकार में से किसी एक को चुनें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | कंप्रेशन मोड: `quality` या `targetSize` |
| quality | integer | No | `75` | कंप्रेशन क्वालिटी, 1-100 (अधिक = कम कंप्रेशन)। `quality` मोड में उपयोग किया जाता है |
| targetSizeKb | number | No | - | किलोबाइट में लक्षित फ़ाइल आकार। `targetSize` मोड में उपयोग किया जाता है |

## Example Request {#example-request}

क्वालिटी के अनुसार कंप्रेस करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

एक लक्षित आकार तक कंप्रेस करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- `quality` मोड में, कम मान अधिक इमेज गिरावट के साथ छोटी फ़ाइलें बनाते हैं।
- `targetSize` मोड में, एक बाइनरी सर्च वह उच्चतम DPI ढूँढता है जो अनुरोधित आकार में फिट होता है।
- यदि कंप्रेशन फ़ाइल को बड़ा कर देगा, तो मूल बाइट्स अपरिवर्तित लौटाए जाते हैं।
- टेक्स्ट और वेक्टर सामग्री प्रभावित नहीं होती; केवल एम्बेडेड रास्टर इमेज को डाउनसैंपल किया जाता है।
