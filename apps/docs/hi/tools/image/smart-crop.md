---
description: "सब्जेक्ट-, फ़ेस-, और एन्ट्रॉपी-अवेयर क्रॉपिंग जो Sharp और AI फ़ेस डिटेक्शन का उपयोग करके छवियों को बुद्धिमानी से फ़्रेम करती है।"
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: 1bcc0731dfac
---

# Smart Crop {#smart-crop}

स्मार्ट सब्जेक्ट-अवेयर, फ़ेस-अवेयर, या ट्रिम-आधारित क्रॉपिंग। बुद्धिमान फ़्रेमिंग के लिए Sharp की attention/entropy रणनीतियों और AI फ़ेस डिटेक्शन का उपयोग करती है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Processing:** असिंक्रोनस (202 लौटाता है, SSE के माध्यम से स्थिति के लिए `/api/v1/jobs/{jobId}/progress` को पोल करें)

**Model bundle:** `face-detection` (200-300 MB) - केवल `face` मोड के लिए आवश्यक

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image फ़ाइल (multipart) |
| mode | string | No | `"subject"` | क्रॉप मोड: `subject`, `face`, `trim`। (लेगेसी मान `attention` और `content` `subject` और `trim` पर मैप होते हैं) |
| strategy | string | No | `"attention"` | सब्जेक्ट मोड के लिए रणनीति: `attention` या `entropy` |
| width | integer | No | - | पिक्सेल में लक्ष्य चौड़ाई |
| height | integer | No | - | पिक्सेल में लक्ष्य ऊँचाई |
| padding | integer | No | `0` | सब्जेक्ट के चारों ओर पैडिंग प्रतिशत (0-50) |
| facePreset | string | No | `"head-shoulders"` | फ़ेस फ़्रेमिंग प्रीसेट: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | No | `0.5` | फ़ेस डिटेक्शन संवेदनशीलता (0-1) |
| threshold | integer | No | `30` | बैकग्राउंड डिटेक्शन के लिए ट्रिम मोड थ्रेशोल्ड (0-255) |
| padToSquare | boolean | No | `false` | ट्रिम किए गए परिणाम को वर्ग में पैड करें |
| padColor | string | No | `"#ffffff"` | पैडिंग के लिए बैकग्राउंड रंग |
| targetSize | integer | No | - | पैड किए गए आउटपुट के लिए लक्ष्य आकार (पिक्सेल) |
| quality | integer | No | - | आउटपुट गुणवत्ता (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Modes {#modes}

### Subject Mode {#subject-mode}
सबसे दृश्य रूप से रोचक क्षेत्र खोजने के लिए Sharp की attention या entropy रणनीति का उपयोग करता है और उसके चारों ओर क्रॉप करता है।

### Face Mode {#face-mode}
AI का उपयोग करके चेहरों का पता लगाता है, फिर निर्दिष्ट `facePreset` का उपयोग करके पहचाने गए चेहरों के चारों ओर क्रॉप को फ़्रेम करता है। यदि कोई चेहरा नहीं मिलता है तो सब्जेक्ट मोड (attention रणनीति) पर वापस चला जाता है।

### Trim Mode {#trim-mode}
छवि से एकसमान बॉर्डर/बैकग्राउंड को हटाता है। वैकल्पिक रूप से परिणाम को निर्दिष्ट बैकग्राउंड रंग और लक्ष्य आकार के साथ एक वर्ग में पैड करता है।

## Notes {#notes}

- यह टूल `executionHint: "long"` के साथ `createToolRoute` फ़ैक्टरी का उपयोग करता है, इसलिए यह SSE प्रगति के साथ 202 लौटाता है।
- फ़ेस मोड के लिए `face-detection` मॉडल बंडल (200-300 MB) आवश्यक है।
- सब्जेक्ट और ट्रिम मोड बिना किसी AI मॉडल बंडल के काम करते हैं।
- `facePreset` यह निर्धारित करता है कि क्रॉप पहचाने गए चेहरों को कितनी कसकर फ़्रेम करता है: `closeup` सबसे कसा हुआ है, `half-body` सबसे चौड़ा है।
- यदि कोई चौड़ाई/ऊँचाई निर्दिष्ट नहीं है, तो डिफ़ॉल्ट 1080x1080 है।
