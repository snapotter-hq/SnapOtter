---
description: "किसी छवि को एक ठोस रंग, पारदर्शी, या धुँधली पृष्ठभूमि के साथ किसी लक्ष्य aspect ratio तक pad करें।"
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: 744bbfe55c0d
---

# Image Pad {#image-pad}

किसी छवि के चारों ओर एक ठोस रंग, पारदर्शी, या धुँधली पृष्ठभूमि जोड़कर उसे किसी लक्ष्य aspect ratio तक pad करें। सोशल मीडिया या प्रिंट के लिए बिना क्रॉप किए छवियों को निश्चित aspect ratios में फ़िट करने के लिए उपयोगी।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

एक image फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | नहीं | `"1:1"` | लक्ष्य aspect ratio: `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, या `custom` |
| ratioW | integer | नहीं | `1` | कस्टम अनुपात चौड़ाई (1-100, जब target `custom` हो तब उपयोग होती है) |
| ratioH | integer | नहीं | `1` | कस्टम अनुपात ऊँचाई (1-100, जब target `custom` हो तब उपयोग होती है) |
| background | string | नहीं | `"color"` | Background मोड: `color`, `transparent`, या `blur` |
| color | string | नहीं | `"#ffffff"` | Background hex रंग (जब background `color` हो) |
| padding | integer | नहीं | `0` | canvas के प्रतिशत के रूप में अतिरिक्त padding (0-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Notes {#notes}

- `blur` background मोड pad भराव के रूप में मूल छवि की एक धुँधली प्रति बनाता है, जिससे दृश्य रूप से सुसंगत परिणाम मिलता है।
- `transparent` background का उपयोग करते समय, alpha को संरक्षित करने के लिए आउटपुट को PNG में बदल दिया जाता है।
- जब तक पारदर्शिता शामिल न हो, आउटपुट प्रारूप इनपुट प्रारूप से मेल खाता है। HEIC, RAW, PSD और SVG इनपुट प्रसंस्करण से पहले स्वचालित रूप से डिकोड किए जाते हैं।
- मनमाने aspect ratios के लिए `target` को `custom` पर सेट करें और `ratioW` तथा `ratioH` प्रदान करें (जैसे, 3:2 के लिए `ratioW: 3, ratioH: 2`)।
