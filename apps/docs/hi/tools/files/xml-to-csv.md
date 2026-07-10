---
description: "XML से दोहराए जाने वाले तत्वों को निकालकर CSV तालिका में लाएँ।"
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: 113d1fe50e65
---

# XML to CSV {#xml-to-csv}

किसी XML फ़ाइल से दोहराए जाने वाले तत्वों को निकालकर एक फ़्लैट CSV तालिका में लाएँ। यह टूल स्वचालित रूप से XML ट्री में ऑब्जेक्ट्स की पहली सरणी खोजता है और प्रत्येक तत्व को एक पंक्ति में मैप करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

एक XML फ़ाइल के साथ multipart form data स्वीकार करता है। किसी settings फ़ील्ड की आवश्यकता नहीं है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। दोहराया जाने वाला तत्व XML संरचना से स्वतः पता लगाया जाता है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Notes {#notes}

- इनपुट के रूप में केवल `.xml` फ़ाइलें स्वीकार की जाती हैं।
- यह टूल XML ट्री में सहोदर तत्वों के पहले दोहराए जाने वाले सेट को स्कैन करता है और उन्हें पंक्तियों के रूप में उपयोग करता है।
- प्रत्येक अद्वितीय चाइल्ड तत्व या विशेषता नाम एक CSV कॉलम हेडर बन जाता है।
- यह एकतरफ़ा रूपांतरण है। द्विदिशीय JSON/XML रूपांतरण के लिए, [JSON to XML](/hi/tools/files/json-xml) टूल का उपयोग करें।
