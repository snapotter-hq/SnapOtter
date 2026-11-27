---
description: "SRT, WebVTT और ASS के बीच सबटाइटल फ़ाइलें कन्वर्ट करें।"
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 1a3bda41ffce
i18n_hash_version: 2
---

# Convert Subtitles {#convert-subtitles}

सबटाइटल फ़ाइल को SRT, WebVTT और ASS के बीच कन्वर्ट करें। टाइमिंग और टेक्स्ट बने रहते हैं, लेकिन ASS की पोज़िशनिंग और इफ़ेक्ट नहीं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

एक सबटाइटल फ़ाइल (`.srt`, `.vtt` या `.ass`) और एक वैकल्पिक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | आउटपुट फ़ॉर्मेट: `srt`, `vtt` या `ass` |
| `encoding` | string | `"auto"` | इनपुट की टेक्स्ट एन्कोडिंग: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` या `euc-kr` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Notes {#notes}

- ASS से कन्वर्ट करने पर टाइमिंग, संवाद का टेक्स्ट और वह बुनियादी फ़ॉर्मेटिंग बनी रहती है जिसे टारगेट फ़ॉर्मेट रख सकता है: SRT इटैलिक, बोल्ड, रंग और फ़ॉन्ट साइज़ को टैग के रूप में रखता है, और WebVTT इटैलिक, बोल्ड और अंडरलाइन रखता है। स्क्रीन पर पोज़िशनिंग, एनिमेशन और अन्य ASS इफ़ेक्ट हटा दिए जाते हैं।
- आउटपुट हमेशा UTF-8 होता है। `encoding` को `auto` पर सेट करने पर, जो फ़ाइल वैध UTF-8 है उसे जैसी है वैसी ही पढ़ा जाता है और बाकी सब Windows-1252 के रूप में पढ़ा जाता है, जो पुरानी पश्चिमी यूरोपीय SRT फ़ाइलों की आम एन्कोडिंग है। यदि उच्चारण चिह्न वाले या गैर-लैटिन अक्षर बिगड़कर दिखें, तो `encoding` को फ़ाइल की असली एन्कोडिंग पर सेट करें (उदाहरण के लिए सरलीकृत चीनी के लिए `gb18030` या सिरिलिक के लिए `windows-1251`)।
- सबटाइटल अपलोड डिफ़ॉल्ट रूप से 1 MB तक सीमित हैं। सीमा को `MAX_SUBTITLE_SIZE_MB` से बढ़ाएं या हटाएं।
