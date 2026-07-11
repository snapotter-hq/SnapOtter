---
description: "किसी वीडियो को नए रिज़ॉल्यूशन या प्रीसेट आकार में स्केल करें।"
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: d201ede30286
---

# Resize Video {#resize-video}

कस्टम पिक्सेल आयामों या एक मानक प्रीसेट का उपयोग करके किसी वीडियो को नए रिज़ॉल्यूशन में स्केल करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | पिक्सेल में लक्ष्य चौड़ाई (16-7680) |
| height | integer | No | - | पिक्सेल में लक्ष्य ऊँचाई (16-4320) |
| preset | string | No | `"custom"` | रिज़ॉल्यूशन प्रीसेट: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

जब `preset` `"custom"` हो, तो `width` या `height` में से कम से कम एक प्रदान किया जाना चाहिए। दूसरा आयाम आनुपातिक रूप से स्केल होता है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

कस्टम आयामों में आकार बदलें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- प्रीसेट मान मानक ऊँचाइयों से मैप होते हैं (जैसे `720p` = 1280x720, `1080p` = 1920x1080)। चौड़ाई स्रोत आस्पेक्ट रेशियो से आनुपातिक रूप से स्केल होती है।
- अधिकांश वीडियो कोडेक की आवश्यकता के अनुसार आयामों को सम संख्याओं में गोल किया जाता है।
- अधिकतम समर्थित रिज़ॉल्यूशन 7680x4320 (8K UHD) है।
