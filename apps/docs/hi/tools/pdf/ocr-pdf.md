---
description: "AI-संचालित OCR का उपयोग करके PDF दस्तावेज़ों से टेक्स्ट निकालें।"
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: b71499c3b582
---

# PDF OCR {#pdf-ocr}

AI-संचालित ऑप्टिकल कैरेक्टर रिकग्निशन का उपयोग करके PDF दस्तावेज़ों से टेक्स्ट निकालें। कई क्वालिटी टियर और भाषाओं का समर्थन करता है। इसके लिए OCR फ़ीचर बंडल का इंस्टॉल होना आवश्यक है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

एक PDF फ़ाइल और एक वैकल्पिक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | OCR क्वालिटी टियर: `fast`, `balanced`, `best` |
| language | string | No | `"auto"` | दस्तावेज़ भाषा: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | पृष्ठ चयन, उदा. `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Example Response {#example-response}

`202 Accepted` लौटाता है। `/api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति ट्रैक करें।

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- स्वीकृत इनपुट फ़ॉर्मेट: `.pdf`।
- यह एक AI टूल है जिसके लिए **OCR feature bundle** का इंस्टॉल होना आवश्यक है। यदि बंडल इंस्टॉल नहीं है, तो API `501 Not Implemented` लौटाता है।
- `fast` क्वालिटी टियर तेज़ प्रोसेसिंग के लिए एक हल्के मॉडल का उपयोग करता है; `best` गति की कीमत पर अधिक सटीक मॉडल का उपयोग करता है।
- `auto` भाषा सेटिंग दस्तावेज़ की भाषा को स्वचालित रूप से पहचानने का प्रयास करती है।
- आप रेंज (`"1-3"`), कॉमा-सेपरेटेड सूचियों (`"1,3,5"`), या हर पृष्ठ के लिए `"all"` का उपयोग करके विशिष्ट पृष्ठों को लक्षित कर सकते हैं।
- ऐसी PDF के लिए जिनमें पहले से चयन योग्य टेक्स्ट है, इसके बजाय तेज़ [PDF to Text](./pdf-to-text) टूल का उपयोग करने पर विचार करें।
