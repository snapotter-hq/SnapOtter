---
description: "इमेज को पिक्सेल, प्रतिशत, या फ़िट मोड के साथ आकार बदलें।"
i18n_source_hash: 53866e8266b8
i18n_provenance: human
i18n_output_hash: 8d7a5fb7e21f
---

# इमेज रीसाइज़ {#resize}

सटीक पिक्सेल आयाम, एक प्रतिशत स्केल फ़ैक्टर, या एक फ़िट मोड निर्दिष्ट करके इमेज का आकार बदलें जो नियंत्रित करता है कि इमेज लक्ष्य आयामों के अनुकूल कैसे होती है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/resize`

एक इमेज फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | पिक्सेल में लक्ष्य चौड़ाई (अधिकतम 16383) |
| height | integer | No | - | पिक्सेल में लक्ष्य ऊँचाई (अधिकतम 16383) |
| fit | string | No | `"contain"` | इमेज आयामों में कैसे फ़िट होती है: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | No | `false` | यदि इमेज लक्ष्य से छोटी है तो अपस्केलिंग रोकें |
| percentage | number | No | - | प्रतिशत के अनुसार स्केल करें (उदा. आधे आकार के लिए 50) |

`width`, `height`, या `percentage` में से कम से कम एक प्रदान किया जाना चाहिए।

### Fit Modes {#fit-modes}

- **contain** - आस्पेक्ट अनुपात को संरक्षित करते हुए, आयामों के भीतर फ़िट करने के लिए आकार बदलें (खाली स्थान छोड़ सकता है)
- **cover** - आस्पेक्ट अनुपात को संरक्षित करते हुए, आयामों को कवर करने के लिए आकार बदलें (क्रॉप कर सकता है)
- **fill** - आयामों से बिल्कुल मेल खाने के लिए खींचें (आस्पेक्ट अनुपात को अनदेखा करता है)
- **inside** - `contain` की तरह, लेकिन केवल डाउनस्केल करता है, कभी अपस्केल नहीं
- **outside** - `cover` की तरह, लेकिन केवल डाउनस्केल करता है, कभी अपस्केल नहीं

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

प्रतिशत के अनुसार आकार बदलें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- किसी भी अक्ष पर अधिकतम आयाम 16383 पिक्सेल है (Sharp/libvips सीमा)।
- आउटपुट प्रारूप इनपुट प्रारूप से मेल खाता है। HEIC, RAW, PSD और SVG इनपुट प्रोसेसिंग से पहले स्वतः डिकोड किए जाते हैं।
- आकार बदलने से पहले EXIF अभिविन्यास स्वतः लागू होता है।
- `withoutEnlargement` फ़्लैग बैच प्रोसेसिंग के लिए उपयोगी है जहाँ कुछ इमेज पहले से ही लक्ष्य से छोटी हो सकती हैं।
