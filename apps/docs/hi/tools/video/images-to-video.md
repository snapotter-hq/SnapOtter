---
description: "छवियों के एक समूह को स्लाइडशो वीडियो, एनिमेटेड GIF या एनिमेटेड WebP में बदलें।"
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: c1d5adb885c9
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

छवियों के एक समूह को प्रति छवि समायोज्य अवधि, रिज़ॉल्यूशन और फ्रेम दर के साथ स्लाइडशो वीडियो में बदलें, या प्रति फ्रेम तय समय और लूप संख्या के साथ एनिमेटेड GIF या WebP में बदलें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

दो या अधिक छवि फ़ाइलों और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | आउटपुट फ़ॉर्मेट: `mp4`, `gif`, `webp` |
| secondsPerImage | number | No | `2` | केवल MP4। सेकंड में प्रति छवि प्रदर्शन अवधि (0.5-10) |
| resolution | string | No | `"720p"` | केवल MP4। आउटपुट रिज़ॉल्यूशन: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | केवल MP4। आउटपुट फ्रेम दर (10-60) |
| frameDelayMs | integer | No | `500` | केवल GIF और WebP। हर छवि कितनी देर दिखती है, मिलीसेकंड में (20-10000) |
| loop | integer | No | `0` | केवल GIF और WebP। एनिमेशन कितनी बार चलता है; `0` का मतलब हमेशा लूप (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

हर छवि को 200 ms तक दिखाने वाला एनिमेटेड GIF बनाने के लिए:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- प्रति अनुरोध 2-60 छवि फ़ाइलें स्वीकार करता है। छवियाँ अपलोड क्रम में वीडियो में दिखाई देती हैं।
- MP4 के लिए, छवियों को आस्पेक्ट रेशियो बनाए रखते हुए लक्ष्य रिज़ॉल्यूशन में फिट करने के लिए आकार बदला और पैड किया जाता है।
- `square` रिज़ॉल्यूशन विकल्प एक 1080x1080 वीडियो बनाता है, जो सोशल मीडिया के लिए उपयोगी है।
- MP4 आउटपुट H.264 है, जिसका नाम `slideshow.mp4` होता है।
- GIF और WebP आउटपुट पहली छवि के आकार का उपयोग करता है। अन्य आकार की छवियों को उसके भीतर फिट होने तक स्केल किया जाता है, और बचा हुआ क्षेत्र पारदर्शी रहता है। फ़ाइल का नाम `slideshow.gif` या `slideshow.webp` होता है।
- GIF फ्रेम समय को सेकंड के सौवें हिस्से में संग्रहीत करता है, इसलिए GIF में `frameDelayMs` को निकटतम 10 ms तक पूर्णांकित किया जाता है। WebP सटीक मान रखता है।
- बड़े एनिमेशन बनाए नहीं जाते, अस्वीकार कर दिए जाते हैं: फ्रेम का आकार गुणा छवियों की संख्या उसी पिक्सेल सीमा के भीतर रहनी चाहिए जो GIF टूल उपयोग करते हैं।
