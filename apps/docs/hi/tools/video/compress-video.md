---
description: "गुणवत्ता नियंत्रण के साथ वीडियो फ़ाइल आकार सिकोड़ें।"
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: 681d21a50656
---

# Compress Video {#compress-video}

समायोज्य संपीड़न सामर्थ्य और वैकल्पिक रिज़ॉल्यूशन डाउनस्केलिंग का उपयोग करके वीडियो फ़ाइल आकार सिकोड़ें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है। यह एक async endpoint है - यह तुरंत `202 Accepted` लौटाता है और प्रगति `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से स्ट्रीम की जाती है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | संपीड़न सामर्थ्य: `light`, `balanced`, `strong` |
| resolution | string | No | `"original"` | आउटपुट रिज़ॉल्यूशन: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `light` प्रीसेट लगभग मूल गुणवत्ता को बनाए रखता है। `strong` प्रीसेट दृश्य निष्ठा की कीमत पर फ़ाइल आकार को आक्रामक रूप से घटाता है।
- रिज़ॉल्यूशन डाउनस्केल करना (जैसे 4K से 720p तक) महत्वपूर्ण आकार कमी के लिए संपीड़न के साथ मिलकर काम करता है।
- जॉब पूरा होने तक `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति अपडेट उपलब्ध रहते हैं।
