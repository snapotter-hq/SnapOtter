---
description: "प्रारंभ और समाप्ति समय निर्दिष्ट करके किसी ऑडियो फ़ाइल से एक खंड काटें।"
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: a30076ceb7e3
i18n_hash_version: 2
---

# Trim Audio {#trim-audio}

किसी ऑडियो फ़ाइल से एक खंड काटें। या तो प्रारंभ और समाप्ति समय के बीच का हिस्सा रखें, या शुरुआत और अंत से एक निश्चित अवधि काट दें।

ऐप में समय वाले फ़ील्ड सादे सेकंड (`90`), `MM:SS` (`1:30`) या `HH:MM:SS` (`1:02:03.5`) स्वीकार करते हैं। API सेकंड स्वीकार करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

एक ऑडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` `startS` से `endS` तक का हिस्सा रखता है। `ends` शुरुआत से `cutStartS` और अंत से `cutEndS` हटाता है |
| startS | number | No | `0` | Range मोड: सेकंड में प्रारंभ समय (न्यूनतम 0) |
| endS | number | Range mode | - | Range मोड: सेकंड में समाप्ति समय (प्रारंभ के बाद होना चाहिए) |
| cutStartS | number | No | `0` | Ends मोड: शुरुआत से हटाए जाने वाले सेकंड |
| cutEndS | number | No | `0` | Ends मोड: अंत से हटाए जाने वाले सेकंड |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

फ़ाइल की लंबाई चाहे जो हो, पहले 2 सेकंड और आख़िरी 3 सेकंड काटें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- समय सेकंड में निर्दिष्ट किए जाते हैं और इनमें दशमलव शामिल हो सकते हैं (जैसे `10.5`)।
- Range मोड में `endS` का मान `startS` से अधिक होना चाहिए। यदि `endS` ऑडियो अवधि से अधिक है, तो फ़ाइल अंत तक ट्रिम की जाती है।
- Ends मोड में `cutStartS` और `cutEndS` में से कम से कम एक शून्य से अधिक होना चाहिए, और दोनों मिलकर कम से कम 0.1 सेकंड का ऑडियो बचा रहने देना चाहिए। कटाई हर फ़ाइल की अपनी लंबाई के हिसाब से मापी जाती है, इसलिए अलग-अलग अवधि वाली फ़ाइलों के बैच में एक ही सेटिंग काम करती है।
- आउटपुट आमतौर पर इनपुट का कंटेनर ही रखता है। AAC इनपुट M4A के रूप में लिखा जाता है, और केवल-डिकोड वाले असमर्थित इनपुट MP3 पर लौट आते हैं।
