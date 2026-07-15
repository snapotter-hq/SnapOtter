---
description: "वैकल्पिक शोर कमी के साथ एडेप्टिव, अनशार्प मास्क, या हाई-पास विधियों का उपयोग करके छवियों को शार्प करें।"
i18n_source_hash: 66dce4068899
i18n_provenance: human
i18n_output_hash: a4764dc09c6d
---

# इमेज शार्पन {#sharpening}

तीन विधियों वाला उन्नत शार्पनिंग टूल: एडेप्टिव (स्मार्ट एज-अवेयर), अनशार्प मास्क (क्लासिक रेडियस/मात्रा), और हाई-पास (टेक्सचर पर जोर)। शार्पनिंग आर्टिफैक्ट को रोकने के लिए इसमें अंतर्निहित शोर कमी शामिल है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

एक image फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| method | string | No | `"adaptive"` | शार्पनिंग एल्गोरिदम: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | No | `1.0` | एडेप्टिव: Gaussian sigma (0.5 से 10) |
| m1 | number | No | `1.0` | एडेप्टिव: सपाट क्षेत्र शार्पनिंग (0 से 10) |
| m2 | number | No | `3.0` | एडेप्टिव: दांतेदार क्षेत्र शार्पनिंग (0 से 20) |
| x1 | number | No | `2.0` | एडेप्टिव: सपाट/दांतेदार थ्रेशोल्ड (0 से 10) |
| y2 | number | No | `12` | एडेप्टिव: अधिकतम सपाट शार्पनिंग (0 से 50) |
| y3 | number | No | `20` | एडेप्टिव: अधिकतम दांतेदार शार्पनिंग (0 से 50) |
| amount | number | No | `100` | अनशार्प मास्क: शार्पनिंग मात्रा (0 से 1000) |
| radius | number | No | `1.0` | अनशार्प मास्क: पिक्सेल में ब्लर रेडियस (0.1 से 5) |
| threshold | number | No | `0` | अनशार्प मास्क: शार्प करने के लिए न्यूनतम चमक अंतर (0 से 255) |
| strength | number | No | `50` | हाई-पास: फ़िल्टर स्ट्रेंथ (0 से 100) |
| kernelSize | number | No | `3` | हाई-पास: कनवोल्यूशन कर्नेल आकार (3 या 5) |
| denoise | string | No | `"off"` | शार्पनिंग से पहले शोर कमी: `off`, `light`, `medium`, `strong` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

समतल क्षेत्रों की रक्षा के लिए थ्रेशोल्ड के साथ अनशार्प मास्क:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Notes {#notes}

- केवल चुनी गई विधि से संबंधित पैरामीटर ही उपयोग किए जाते हैं। उदाहरण के लिए, जब `method` `adaptive` हो तो `amount`, `radius`, और `threshold` को अनदेखा किया जाता है।
- एडेप्टिव विधि Sharp की अंतर्निहित एडेप्टिव शार्पनिंग का उपयोग करती है जिसमें कॉन्फ़िगर करने योग्य सपाट/दांतेदार क्षेत्र व्यवहार होता है।
- `denoise` विकल्प शोर/ग्रेन के प्रवर्धन को रोकने के लिए शार्पनिंग से पहले शोर कमी लागू करता है।
- हाई-पास शार्पनिंग मूल से एक ब्लर किए गए संस्करण को घटाकर बारीक विवरण निकालती है, फिर उसे वापस मिलाती है।
- आउटपुट फ़ॉर्मेट इनपुट फ़ॉर्मेट से मेल खाता है। HEIC, RAW, PSD, और SVG इनपुट प्रोसेसिंग से पहले स्वचालित रूप से डिकोड किए जाते हैं।
