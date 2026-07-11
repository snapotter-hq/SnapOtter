---
description: "प्रारूप रूपांतरण, गुणवत्ता नियंत्रण, आकार बदलने और मेटाडेटा हटाने के साथ इमेज को वेब डिलीवरी के लिए ऑप्टिमाइज़ करें।"
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: 76e1bceb8af9
---

# Optimize for Web {#optimize-for-web}

एक ही चरण में इमेज को वेब डिलीवरी के लिए ऑप्टिमाइज़ करें। प्रारूप रूपांतरण, गुणवत्ता समायोजन, वैकल्पिक आकार बदलना, प्रोग्रेसिव एन्कोडिंग और मेटाडेटा हटाने को संयोजित करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

एक इमेज फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

एक लाइव प्रीव्यू एंडपॉइंट भी `POST /api/v1/tools/image/optimize-for-web/preview` पर उपलब्ध है, जो रीयल-टाइम पैरामीटर ट्यूनिंग के लिए प्रोसेस की गई इमेज को सीधे बाइनरी के रूप में लौटाता है (कोई वर्कस्पेस निर्माण नहीं)।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"webp"` | आउटपुट प्रारूप: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | No | `80` | आउटपुट गुणवत्ता (1-100) |
| maxWidth | number | No | - | पिक्सेल में अधिकतम चौड़ाई। यदि इमेज अधिक चौड़ी हो तो उसे डाउनस्केल किया जाता है। |
| maxHeight | number | No | - | पिक्सेल में अधिकतम ऊँचाई। यदि इमेज अधिक ऊँची हो तो उसे डाउनस्केल किया जाता है। |
| progressive | boolean | No | `true` | प्रोग्रेसिव/इंटरलेस्ड एन्कोडिंग सक्षम करें |
| stripMetadata | boolean | No | `true` | EXIF, GPS, ICC और XMP मेटाडेटा हटाएँ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

आक्रामक संपीड़न के साथ AVIF के लिए ऑप्टिमाइज़ करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Preview Endpoint Response {#preview-endpoint-response}

प्रीव्यू एंडपॉइंट (`/api/v1/tools/image/optimize-for-web/preview`) सूचनात्मक हेडर के साथ बाइनरी इमेज को सीधे लौटाता है:

- `X-Original-Size` - बाइट्स में मूल फ़ाइल का आकार
- `X-Processed-Size` - बाइट्स में प्रोसेस की गई फ़ाइल का आकार
- `X-Output-Filename` - URL-एन्कोडेड आउटपुट फ़ाइल नाम

## Notes {#notes}

- यह टूल वेब एसेट्स के लिए एक वन-स्टॉप ऑप्टिमाइज़ेशन पाइपलाइन के रूप में डिज़ाइन किया गया है। यह एक ही पास में प्रारूप रूपांतरण, गुणवत्ता ट्यूनिंग, अधिकतम आयाम सीमा और मेटाडेटा हटाना संभालता है।
- चुने गए प्रारूप से मेल खाने के लिए आउटपुट फ़ाइल नाम एक्सटेंशन को अपडेट किया जाता है।
- JXL (JPEG XL) एन्कोडिंग एक विशेष CLI एन्कोडर का उपयोग करती है। इमेज को पहले PNG के रूप में प्रोसेस किया जाता है, फिर JXL में एन्कोड किया जाता है।
- प्रोग्रेसिव एन्कोडिंग ब्राउज़र को पूर्ण इमेज लोड होने से पहले एक निम्न-गुणवत्ता प्रीव्यू रेंडर करने की अनुमति देकर JPEG और PNG के लिए अनुभूत लोड समय में सुधार करती है।
- प्रीव्यू एंडपॉइंट हल्का है (कोई वर्कस्पेस/जॉब निर्माण नहीं) और फ्रंटएंड के लाइव पैरामीटर ट्यूनिंग UI के लिए अभिप्रेत है।
