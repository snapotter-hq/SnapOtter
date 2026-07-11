---
description: "सबटाइटल को वीडियो फ्रेम पर स्थायी रूप से रेंडर करें।"
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 98192da79a4f
---

# Burn Subtitles {#burn-subtitles}

किसी SRT, VTT, या ASS फ़ाइल से सबटाइटल को वीडियो के हर फ्रेम पर स्थायी रूप से रेंडर (हार्ड-कोड) करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

एक वीडियो फ़ाइल और एक सबटाइटल फ़ाइल के साथ multipart form data स्वीकार करता है। यह एक async endpoint है - यह तुरंत `202 Accepted` लौटाता है और प्रगति `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से स्ट्रीम की जाती है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | पिक्सेल में सबटाइटल फ़ॉन्ट आकार (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- दो फ़ाइलें अपलोड करें: पहली एक वीडियो होनी चाहिए, दूसरी एक सबटाइटल फ़ाइल (.srt, .vtt, या .ass) होनी चाहिए।
- बर्न किए गए सबटाइटल स्थायी रूप से वीडियो का हिस्सा होते हैं और दर्शक द्वारा बंद नहीं किए जा सकते। टॉगल किए जा सकने वाले सबटाइटल के लिए, इसके बजाय Embed Subtitles टूल का उपयोग करें।
- जॉब पूरा होने तक `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति अपडेट उपलब्ध रहते हैं।
