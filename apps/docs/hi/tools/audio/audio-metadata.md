---
description: "audio मेटाडेटा टैग (ID3) देखें, संपादित करें, या हटाएँ।"
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: a68733a6d7d7
---

# Audio Metadata {#audio-metadata}

audio मेटाडेटा टैग जैसे title, artist, और album (ID3 और समान टैग फ़ॉर्मैट) देखें, संपादित करें, या हटाएँ।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

एक audio फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strip | boolean | No | `false` | सभी मौजूदा मेटाडेटा टैग हटाएँ |
| title | string | No | - | title टैग सेट करें (अधिकतम 500 अक्षर) |
| artist | string | No | - | artist टैग सेट करें (अधिकतम 500 अक्षर) |
| album | string | No | - | album टैग सेट करें (अधिकतम 500 अक्षर) |

## Example Request {#example-request}

मेटाडेटा टैग संपादित करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

सभी मेटाडेटा हटाएँ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## Notes {#notes}

- रिस्पॉन्स में container फ़ॉर्मैट, duration, bitrate, और मौजूदा टैग के साथ एक `metadata` ऑब्जेक्ट शामिल होता है।
- जब `strip` `true` होता है, तो सभी टैग फ़ील्ड नज़रअंदाज़ किए जाते हैं और हर मौजूदा टैग हटा दिया जाता है।
- केवल आपके द्वारा प्रदान किए गए टैग ही अपडेट होते हैं; अनिर्दिष्ट टैग अपरिवर्तित रहते हैं।
- आउटपुट फ़ॉर्मैट इनपुट फ़ॉर्मैट से मेल खाता है।
