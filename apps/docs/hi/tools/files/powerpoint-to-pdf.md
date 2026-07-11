---
description: "प्रस्तुतियों को PDF में बदलें।"
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 5c2719b08ed9
---

# PowerPoint to PDF {#powerpoint-to-pdf}

PowerPoint या OpenDocument प्रस्तुतियों को PDF में बदलें, प्रति पृष्ठ एक स्लाइड के साथ।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

एक PowerPoint/ODP फ़ाइल के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। एक प्रस्तुति अपलोड करें और इसे PDF में बदल दिया जाएगा।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Example Response {#example-response}

`202 Accepted` लौटाता है। `/api/v1/jobs/{jobId}/progress` पर SSE के ज़रिए प्रगति ट्रैक करें।

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- स्वीकृत इनपुट प्रारूप: `.pptx`, `.ppt`, `.odp`।
- प्रत्येक स्लाइड PDF में एक पृष्ठ बन जाती है।
- रूपांतरण सर्वर पर headless चल रहे LibreOffice द्वारा संभाला जाता है।
- PDF आउटपुट में एनिमेशन और ट्रांज़िशन शामिल नहीं होते।
