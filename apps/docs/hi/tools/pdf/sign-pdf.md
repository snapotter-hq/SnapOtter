---
description: "सामान्यीकृत पृष्ठ प्लेसमेंट का उपयोग करके अपलोड की गई हस्ताक्षर इमेज को एक PDF पर स्टैम्प करें।"
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: 0aa800dacaf7
---

# Sign PDF {#sign-pdf}

एक या अधिक अपलोड की गई हस्ताक्षर PNG इमेज को एक PDF के किसी भी पृष्ठ पर स्टैम्प करें। यह रूट एक कस्टम multipart contract का उपयोग करता है क्योंकि इसे PDF, एक या अधिक हस्ताक्षर इमेज, और प्लेसमेंट निर्देशांक की आवश्यकता होती है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

multipart form data स्वीकार करता है। PDF `file` के रूप में भेजी जाती है; हस्ताक्षर `sig0`, `sig1`, और इसी तरह भेजे जाते हैं; प्लेसमेंट एक `placements` JSON फ़ील्ड में भेजे जाते हैं।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | हस्ताक्षर करने के लिए PDF फ़ाइल |
| sig0 | file | Yes | - | पहली हस्ताक्षर इमेज। अतिरिक्त इमेज `sig1`, `sig2`, और इसी तरह उपयोग करती हैं |
| placements | JSON string | Yes | - | प्लेसमेंट ऑब्जेक्ट का ऐरे: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | No | - | SSE के माध्यम से प्रगति ट्रैकिंग के लिए वैकल्पिक UUID |
| fileId | string | No | - | हस्ताक्षरित परिणाम को नए संस्करण के रूप में सहेजने के लिए वैकल्पिक फ़ाइल लाइब्रेरी ID |

## Placement Coordinates {#placement-coordinates}

| Field | Type | Description |
|-------|------|-------------|
| sig | integer | हस्ताक्षर इमेज इंडेक्स। `0` `sig0` से मैप होता है |
| page | integer | शून्य-आधारित PDF पृष्ठ इंडेक्स |
| x | number | पृष्ठ अंश के रूप में बाईं स्थिति |
| y | number | पृष्ठ अंश के रूप में शीर्ष स्थिति |
| w | number | पृष्ठ अंश के रूप में हस्ताक्षर की चौड़ाई |
| h | number | पृष्ठ अंश के रूप में हस्ताक्षर की ऊँचाई |

निर्देशांक ऊपर-बाएं मूल बिंदु का उपयोग करते हैं। मान पृष्ठ के किनारे से थोड़ा आगे तक फैल सकते हैं; PDF रेंडरर अंतिम स्टैम्प को पृष्ठ तक क्लिप करता है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

यदि अनुरोध सिंक्रोनस प्रतीक्षा विंडो के भीतर पूरा नहीं हो सकता, तो API लौटाता है:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

`/api/v1/jobs/<jobId>/progress` से कनेक्ट करें और जॉब पूरा होने पर परिणाम डाउनलोड करें।

## Notes {#notes}

- स्वीकृत PDF इनपुट फ़ॉर्मेट: `.pdf`।
- हस्ताक्षर इमेज वैध इमेज फ़ाइलें होनी चाहिए, आमतौर पर पारदर्शिता वाली PNG।
- 100 तक हस्ताक्षर इमेज और 100 प्लेसमेंट स्वीकार किए जाते हैं।
- `sign-pdf` एक कस्टम रूट है और मानक टूल `settings` JSON फ़ील्ड का उपयोग नहीं करता।
