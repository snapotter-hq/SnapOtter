---
description: "किसी वीडियो के ऑडियो ट्रैक को दूसरी फ़ाइल से बदलें।"
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: e51ee0a4dfc9
---

# Replace Audio {#replace-audio}

किसी वीडियो के ऑडियो ट्रैक को एक ऑडियो फ़ाइल से बदलें। एक वीडियो और एक ऑडियो फ़ाइल दोनों अपलोड करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

ठीक दो फ़ाइलों के साथ multipart form data स्वीकार करता है: एक वीडियो फ़ाइल के बाद एक ऑडियो फ़ाइल।

## Parameters {#parameters}

इस टूल में कोई सेटिंग पैरामीटर नहीं है। एक वीडियो फ़ाइल और एक ऑडियो फ़ाइल दो `file` पार्ट्स के रूप में अपलोड करें।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- ठीक दो फ़ाइलें अपलोड की जानी चाहिए: पहली एक वीडियो होनी चाहिए, दूसरी एक ऑडियो फ़ाइल होनी चाहिए।
- यदि ऑडियो फ़ाइल वीडियो से लंबी है, तो उसे वीडियो अवधि से मेल खाने के लिए ट्रिम किया जाता है। यदि छोटी है, तो शेष वीडियो शांति में चलता है।
- वीडियो स्ट्रीम को फिर से एन्कोड किए बिना कॉपी किया जाता है, इसलिए कोई वीडियो गुणवत्ता हानि नहीं होती।
