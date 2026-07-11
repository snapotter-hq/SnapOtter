---
description: "पृष्ठ निकालें या एक PDF को भागों में विभाजित करें।"
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: a3a9b248b006
---

# Split PDF {#split-pdf}

पृष्ठों की एक रेंज को एक नई PDF में निकालें, या किसी दस्तावेज़ को N पृष्ठों के खंडों में विभाजित करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"range"` | स्प्लिट मोड: `range` या `every` |
| range | string | जब mode `range` हो | - | qpdf सिंटैक्स में पृष्ठ रेंज, उदा. `"1-5,8,10-z"` |
| everyN | integer | जब mode `every` हो | - | N पृष्ठों के खंडों में विभाजित करें (1-500) |

## Example Request {#example-request}

विशिष्ट पृष्ठ निकालें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

10 पृष्ठों के खंडों में विभाजित करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- `range` मोड में, चयनित पृष्ठों वाली एक ही PDF लौटाई जाती है।
- `every` मोड में, परिणाम अलग-अलग भागों वाला एक ZIP आर्काइव होता है।
- पृष्ठ रेंज qpdf सिंटैक्स का उपयोग करती हैं: पृष्ठ 1 से 5 तक के लिए `1-5`, अंतिम पृष्ठ के लिए `z`, और रेंज संयोजित करने के लिए कॉमा (उदा. `1-3,7,10-z`)।
