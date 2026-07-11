---
description: "पिक्सेल-स्तरीय अंतर दृश्यीकरण और समानता स्कोर के साथ दो छवियों की साथ-साथ तुलना करें।"
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: b5a6d14888e5
---

# Image Compare {#image-compare}

पिक्सेल-स्तरीय अंतर मानचित्र और एक संख्यात्मक समानता प्रतिशत की गणना के लिए दो छवियाँ अपलोड करें। आउटपुट एक अंतर छवि है जो बदले गए क्षेत्रों को लाल रंग में उजागर करती है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compare`

**दो** छवि फ़ाइलों के साथ मल्टीपार्ट फ़ॉर्म डेटा स्वीकार करता है। किसी सेटिंग्स फ़ील्ड की आवश्यकता नहीं है।

## Parameters {#parameters}

इस टूल में कोई विन्यास योग्य पैरामीटर नहीं है। ठीक दो छवि फ़ाइलें अपलोड करें।

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file (first) | file | Yes | पहली छवि |
| file (second) | file | Yes | दूसरी छवि |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| jobId | string | अंतर छवि डाउनलोड करने के लिए जॉब पहचानकर्ता |
| similarity | number | दोनों छवियों के बीच प्रतिशत समानता (0 से 100) |
| dimensions | object | तुलना के लिए उपयोग की गई चौड़ाई और ऊँचाई |
| downloadUrl | string | उत्पन्न अंतर छवि डाउनलोड करने के लिए URL |
| originalSize | number | दोनों इनपुट छवियों का संयुक्त आकार बाइट्स में |
| processedSize | number | अंतर आउटपुट छवि का आकार बाइट्स में |

## Notes {#notes}

- तुलना से पहले दोनों छवियों का समान आयाम (प्रत्येक अक्ष का अधिकतम) में आकार बदला जाता है।
- अंतर छवि लाल रंग में अंतरों को उजागर करती है, जिसकी अपारदर्शिता परिवर्तन की मात्रा के समानुपाती होती है। समान या लगभग-समान पिक्सेल (अंतर < 10) मूल के अर्ध-पारदर्शी संस्करण के रूप में दिखाए जाते हैं।
- समानता की गणना सभी पिक्सेल में औसत पिक्सेल अंतर के व्युत्क्रम के रूप में की जाती है, जिसे प्रतिशत के रूप में व्यक्त किया जाता है।
- 100% की समानता का अर्थ है कि छवियाँ पिक्सेल-समान हैं (तुलना विभेदन पर)।
- अंतर आउटपुट इनपुट फ़ॉर्मेट की परवाह किए बिना हमेशा PNG फ़ॉर्मेट होता है।
- तुलना से पहले दोनों छवियाँ मान्य और डिकोड की जाती हैं (HEIC, RAW, PSD, SVG समर्थित)।
- प्रोसेसिंग से पहले दोनों छवियों पर EXIF अभिविन्यास स्वचालित रूप से लागू किया जाता है।
