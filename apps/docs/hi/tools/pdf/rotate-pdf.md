---
description: "एक PDF में पृष्ठों को 90, 180, या 270 डिग्री घुमाएं।"
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: ad586f0187ab
---

# Rotate PDF {#rotate-pdf}

एक निर्दिष्ट कोण पर एक PDF में सभी या चयनित पृष्ठों को घुमाएं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | integer | No | `90` | घूर्णन कोण: `90`, `180`, या `270` |
| range | string | No | `"1-z"` | qpdf सिंटैक्स में पृष्ठ रेंज, उदा. `"1-5,8"` (`"1-z"` = सभी पृष्ठ) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- घूर्णन दक्षिणावर्त होता है।
- पृष्ठ रेंज qpdf सिंटैक्स का उपयोग करती हैं: पृष्ठ 1 से 5 तक के लिए `1-5`, अंतिम पृष्ठ के लिए `z`, और रेंज संयोजित करने के लिए कॉमा।
- डिफ़ॉल्ट रेंज `"1-z"` सभी पृष्ठों को घुमाती है।
