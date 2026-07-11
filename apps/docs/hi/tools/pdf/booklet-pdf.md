---
description: "PDF पृष्ठों को बुकलेट में मोड़ने के लिए व्यवस्थित करें।"
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 815bcba206c0
---

# Booklet PDF {#booklet-pdf}

डुप्लेक्स प्रिंटिंग के लिए पृष्ठों को इम्पोज़ करें ताकि प्रिंट की गई शीटों को एक बुकलेट में मोड़ा जा सके।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | प्रति शीट पृष्ठ: `2`, `4`, `6`, या `8` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- डिफ़ॉल्ट `perSheet: 2` प्रत्येक शीट पर दो पृष्ठों को अगल-बगल रखता है, जो डुप्लेक्स प्रिंटिंग के लिए मानक बुकलेट लेआउट है।
- यदि कुल पृष्ठ गणना शीट आकार का गुणज नहीं है तो खाली पृष्ठ स्वचालित रूप से जोड़े जाते हैं।
- आउटपुट को short-edge बाइंडिंग पर डबल-साइडेड प्रिंट करें, फिर मोड़ें और स्टेपल करें।
