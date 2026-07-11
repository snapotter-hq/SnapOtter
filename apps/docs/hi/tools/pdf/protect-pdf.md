---
description: "AES-256 एन्क्रिप्शन के साथ एक PDF में पासवर्ड सुरक्षा जोड़ें।"
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 3ea6bd1a9a3a
---

# Protect PDF {#protect-pdf}

AES-256 एन्क्रिप्शन का उपयोग करके एक PDF में पासवर्ड सुरक्षा जोड़ें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| userPassword | string | Yes | - | PDF खोलने के लिए आवश्यक पासवर्ड (1-256 अक्षर) |
| ownerPassword | string | No | `userPassword` के समान | अनुमतियों के लिए ओनर पासवर्ड (1-256 अक्षर) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- एन्क्रिप्शन AES-256 का उपयोग करता है।
- यदि `ownerPassword` छोड़ दिया जाता है, तो यह डिफ़ॉल्ट रूप से `userPassword` के समान मान लेता है।
- पासवर्ड ऑडिट लॉग से हटा दिए जाते हैं।
- एन्क्रिप्टेड PDF को खोलने के लिए यूज़र पासवर्ड और पूर्ण अनुमतियों के लिए ओनर पासवर्ड (यदि भिन्न हो) की आवश्यकता होती है।
