---
description: "चयनित पृष्ठों को PDF से निकालकर एक नए दस्तावेज़ में डालें।"
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: b17b2cbb43a5
---

# Extract Pages {#extract-pages}

चयनित पृष्ठों को PDF से निकालकर एक नए, छोटे दस्तावेज़ में डालें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| range | string | Yes | - | qpdf सिंटैक्स में पृष्ठ रेंज, उदा. `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- पृष्ठ रेंज qpdf सिंटैक्स का उपयोग करती हैं: पृष्ठ 1 से 5 तक के लिए `1-5`, अंतिम पृष्ठ के लिए `z`, और रेंज संयोजित करने के लिए कॉमा (उदा. `1-3,7,10-z`)।
- निकाले गए पृष्ठ अपनी मूल फ़ॉर्मेटिंग, एनोटेशन और लिंक बनाए रखते हैं।
