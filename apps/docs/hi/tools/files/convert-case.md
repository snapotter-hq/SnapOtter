---
description: "टेक्स्ट को UPPER, lower, Title, Sentence केस और अन्य में बदलें।"
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: 5be92a535de8
i18n_hash_version: 2
---

# Convert Case {#convert-case}

टेक्स्ट पेस्ट करें, केस चुनें और नतीजा कॉपी करें। टेक्स्ट आपके अपने SnapOtter सर्वर पर जाता है और कहीं और नहीं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

multipart form data के बजाय JSON बॉडी स्वीकार करता है, और डाउनलोड के लिए फ़ाइल के बजाय कन्वर्ट किया गया टेक्स्ट लौटाता है।

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (आवश्यक) | कन्वर्ट करने के लिए टेक्स्ट। अधिकतम 1,000,000 अक्षर। |
| `mode` | string | (आवश्यक) | नीचे दिए गए मोड में से एक। |
| `locale` | string | (कोई नहीं) | BCP 47 भाषा टैग, जैसे `tr` या `de`, उन अक्षरों के लिए जिनका केस भाषा पर निर्भर करता है। इसके बिना, केसिंग हर भाषा के लिए एक जैसी रहती है। |

| Mode | Input | Output |
|------|-------|--------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Example Response {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notes {#notes}

- `title` छोटे अंग्रेज़ी शब्दों (a, an, and, of, the, to और इसी तरह के) को छोटे अक्षरों में रखता है, जब तक वे पंक्ति की शुरुआत या अंत में न हों। `capitalized` हर शब्द को कैपिटल करता है।
- `sentence` टेक्स्ट की शुरुआत में, लाइन ब्रेक के बाद, और `.`, `!`, `?` या `…` के बाद स्पेस आने पर नया वाक्य शुरू करता है, इसलिए `snapotter.com` या `3.5` में आया बिंदु नहीं गिना जाता।
- `camel`, `pascal`, `snake` और `kebab` स्पेस, विराम चिह्न और मौजूदा केस बदलाव पर शब्द तोड़ते हैं (`XMLHttpRequest` बन जाता है `xml_http_request`), और हर पंक्ति को अलग से कन्वर्ट करते हैं।
- `locale` को `tr` पर सेट करने पर, `i` अपरकेस में `İ` और `I` लोअरकेस में `ı` बन जाता है। जर्मन `ß` हर लोकेल में अपरकेस में `SS` बनता है।
- वेब ऐप अपनी मौजूदा इंटरफ़ेस भाषा को `locale` के रूप में भेजता है।
