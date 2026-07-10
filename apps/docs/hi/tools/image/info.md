---
description: "विस्तृत छवि मेटाडेटा, गुण और प्रति-चैनल histogram आँकड़े देखें।"
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: f5ff7689f5c8
---

# Image Info {#image-info}

केवल-पढ़ने योग्य विश्लेषण टूल जो आयाम, प्रारूप, color space, EXIF/ICC/XMP उपस्थिति और प्रति-चैनल histogram आँकड़ों सहित व्यापक छवि मेटाडेटा लौटाता है। कोई संसाधित आउटपुट फ़ाइल उत्पन्न नहीं करता।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/info`

एक image फ़ाइल के साथ multipart form data स्वीकार करता है। किसी settings फ़ील्ड की आवश्यकता नहीं है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य parameter नहीं है। बस image फ़ाइल अपलोड करें।

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | हाँ | विश्लेषण करने के लिए छवि |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | स्वच्छ किया गया फ़ाइलनाम |
| fileSize | number | फ़ाइल आकार बाइट में |
| width | number | छवि चौड़ाई पिक्सेल में |
| height | number | छवि ऊँचाई पिक्सेल में |
| format | string | पहचाना गया प्रारूप (jpeg, png, webp, आदि) |
| channels | number | रंग चैनलों की संख्या |
| hasAlpha | boolean | क्या छवि में alpha चैनल है |
| colorSpace | string | Color space (srgb, cmyk, आदि) |
| density | number या null | DPI/PPI रिज़ॉल्यूशन |
| isProgressive | boolean | क्या JPEG progressive एन्कोडिंग का उपयोग करता है |
| orientation | number या null | EXIF orientation मान (1-8) |
| hasProfile | boolean | क्या कोई ICC profile एम्बेडेड है |
| hasExif | boolean | क्या EXIF मेटाडेटा मौजूद है |
| hasIcc | boolean | क्या कोई ICC color profile मौजूद है |
| hasXmp | boolean | क्या XMP मेटाडेटा मौजूद है |
| bitDepth | string या null | प्रति नमूना बिट्स |
| pages | number | पृष्ठों की संख्या (TIFF, GIF जैसे multi-page प्रारूपों के लिए) |
| histogram | array | प्रति-चैनल आँकड़े (min, max, mean, मानक विचलन) |

## Notes {#notes}

- यह एक केवल-पढ़ने योग्य endpoint है। यह कोई डाउनलोड करने योग्य आउटपुट फ़ाइल या `jobId` उत्पन्न नहीं करता।
- RAW प्रारूप की छवियों (DNG, CR2, NEF, ARW, आदि) के लिए, ExifTool का उपयोग वास्तविक सेंसर आयाम और मेटाडेटा फ़्लैग निकालने के लिए किया जाता है जिन्हें Sharp सीधे नहीं पढ़ सकता।
- HEIC/HEIF फ़ाइलें पिक्सेल आँकड़े निकालने के लिए आंतरिक रूप से PNG में डिकोड की जाती हैं, क्योंकि Sharp HEVC पिक्सेल को डिकोड नहीं कर सकता।
- histogram प्रति चैनल min/max/mean/stdev प्रदान करता है, पूर्ण 256-bin वितरण नहीं।
- `density` फ़ील्ड एम्बेडेड DPI मेटाडेटा को दर्शाता है, यदि मौजूद हो।
