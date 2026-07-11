---
description: "कई वीडियो क्लिप को एक फ़ाइल में जोड़ें।"
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 420e0e49a9c9
---

# Merge Videos {#merge-videos}

कई वीडियो क्लिप को एक ही MP4 फ़ाइल में जोड़ें। सभी इनपुट को पहले वीडियो के रिज़ॉल्यूशन और 30 fps पर सामान्यीकृत किया जाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

दो या अधिक वीडियो फ़ाइलों के साथ multipart form data स्वीकार करता है। यह एक async endpoint है - यह तुरंत `202 Accepted` लौटाता है और प्रगति `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से स्ट्रीम की जाती है।

## Parameters {#parameters}

इस टूल में कोई सेटिंग पैरामीटर नहीं है। 2-10 वीडियो फ़ाइलें कई `file` पार्ट्स के रूप में अपलोड करें।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- क्लिप उसी क्रम में जोड़े जाते हैं जिस क्रम में उन्हें अपलोड किया जाता है।
- सभी क्लिप को पहले क्लिप के रिज़ॉल्यूशन, फ्रेम दर (30 fps), और कोडेक (H.264) से मेल खाने के लिए फिर से एन्कोड किया जाता है। बेमेल इनपुट स्वतः सामान्यीकृत हो जाते हैं।
- प्रति अनुरोध 2-10 वीडियो फ़ाइलें स्वीकार करता है।
- जॉब पूरा होने तक `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति अपडेट उपलब्ध रहते हैं।
