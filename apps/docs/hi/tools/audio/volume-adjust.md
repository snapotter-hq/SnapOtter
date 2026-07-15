---
description: "डेसिबल में एक निश्चित गेन द्वारा ऑडियो वॉल्यूम बढ़ाएं या घटाएं।"
i18n_source_hash: 4bc993fd4e08
i18n_provenance: human
i18n_output_hash: 4c6ec316cac8
---

# वॉल्यूम समायोजन {#volume-adjust}

डेसिबल में एक निश्चित गेन लागू करके किसी ऑडियो फ़ाइल के वॉल्यूम को बढ़ाएं या घटाएं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

एक ऑडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| gainDb | number | No | `3` | डेसिबल में वॉल्यूम समायोजन (-30 से 30) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- धनात्मक मान वॉल्यूम बढ़ाते हैं; ऋणात्मक मान इसे घटाते हैं।
- बड़े धनात्मक गेन क्लिपिंग का कारण बन सकते हैं। लाउडनेस-सुरक्षित लेवलिंग के लिए normalize-audio का उपयोग करें।
- आउटपुट आमतौर पर इनपुट कंटेनर को बनाए रखता है। AAC इनपुट को M4A के रूप में लिखा जाता है, और असमर्थित decode-only इनपुट MP3 पर वापस चले जाते हैं।
