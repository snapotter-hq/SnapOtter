---
description: "किसी वीडियो में से सबटाइटल ट्रैक को SRT, WebVTT या ASS फ़ाइल के रूप में निकालें।"
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: 31cdacf38b99
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

किसी वीडियो कंटेनर में से एम्बेडेड सबटाइटल ट्रैक निकालें और उसे SRT, WebVTT या ASS फ़ाइल के रूप में डाउनलोड करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

एक वीडियो फ़ाइल और एक वैकल्पिक `settings` JSON स्ट्रिंग के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | आउटपुट फ़ॉर्मैट: `srt`, `vtt` (WebVTT) या `ass` |

वीडियो कंटेनर में मिला पहला सबटाइटल ट्रैक निकाला जाता है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- वीडियो में एक एम्बेडेड सबटाइटल ट्रैक होना चाहिए। यदि कोई सबटाइटल ट्रैक नहीं मिलता, तो अनुरोध 400 त्रुटि लौटाता है।
- यदि वीडियो में कई सबटाइटल ट्रैक हैं, तो पहला निकाला जाता है।
- टेक्स्ट ट्रैक (SubRip, ASS, mov_text, WebVTT) तीनों में से किसी भी आउटपुट फ़ॉर्मैट में बदले जा सकते हैं। ASS ट्रैक को SRT या WebVTT में बदलने पर उसकी पोज़िशनिंग और इफ़ेक्ट हट जाते हैं।
- इमेज-आधारित ट्रैक (Blu-ray PGS, DVD VobSub) OCR के बिना टेक्स्ट में नहीं बदले जा सकते और 422 त्रुटि लौटाते हैं।
