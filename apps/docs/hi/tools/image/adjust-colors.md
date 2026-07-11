---
description: "चमक, कंट्रास्ट, संतृप्ति, तापमान, ह्यू, चैनल समायोजित करें और रंग प्रभाव लागू करें।"
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: a439daab9132
---

# Adjust Colors {#adjust-colors}

एक ही एंडपॉइंट में चमक, कंट्रास्ट, एक्सपोज़र, संतृप्ति, तापमान, टिंट, ह्यू रोटेशन, प्रति-चैनल स्तर, और एक-क्लिक प्रभावों (ग्रेस्केल, सेपिया, इनवर्ट) को मिलाने वाला व्यापक रंग समायोजन टूल।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

एक छवि फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | चमक समायोजन (-100 से 100) |
| contrast | number | No | `0` | कंट्रास्ट समायोजन (-100 से 100) |
| exposure | number | No | `0` | एक्सपोज़र / मिडटोन गामा (-100 से 100) |
| saturation | number | No | `0` | रंग संतृप्ति (-100 से 100) |
| temperature | number | No | `0` | व्हाइट बैलेंस: ठंडा/नीला से गर्म/नारंगी (-100 से 100) |
| tint | number | No | `0` | टिंट शिफ्ट: हरा से मैजेंटा (-100 से 100) |
| hue | number | No | `0` | डिग्री में ह्यू रोटेशन (-180 से 180) |
| sharpness | number | No | `0` | शार्पनिंग की ताकत (0 से 100) |
| red | number | No | `100` | लाल चैनल स्तर (0 से 200, 100 = अपरिवर्तित) |
| green | number | No | `100` | हरा चैनल स्तर (0 से 200, 100 = अपरिवर्तित) |
| blue | number | No | `100` | नीला चैनल स्तर (0 से 200, 100 = अपरिवर्तित) |
| effect | string | No | `"none"` | रंग प्रभाव: `none`, `grayscale`, `sepia`, `invert` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

एक गर्म विंटेज लुक लागू करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes {#notes}

- सभी पैरामीटर तटस्थ मानों पर डिफ़ॉल्ट होते हैं ताकि आप केवल वही समायोजित कर सकें जिसकी आपको आवश्यकता है।
- समायोजन इस क्रम में लागू किए जाते हैं: चमक, कंट्रास्ट, एक्सपोज़र, संतृप्ति/ह्यू, तापमान/टिंट, शार्पनेस, चैनल, प्रभाव।
- तापमान नीले-नारंगी और हरे-मैजेंटा अक्षों पर एक 3x3 रंग पुनर्संयोजन मैट्रिक्स का उपयोग करता है।
- एक्सपोज़र Sharp के गामा फ़ंक्शन से मैप होता है (धनात्मक मिडटोन को उज्ज्वल करता है, ऋणात्मक उन्हें गहरा करता है)।
- यह एंडपॉइंट लेगेसी पथों `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels`, और `/api/v1/tools/image/color-effects` पर भी प्रतिक्रिया देता है। सभी एक ही स्कीमा का उपयोग करते हैं।
- आउटपुट प्रारूप इनपुट प्रारूप से मेल खाता है। HEIC, RAW, PSD, और SVG इनपुट को प्रोसेसिंग से पहले स्वचालित रूप से डिकोड किया जाता है।
