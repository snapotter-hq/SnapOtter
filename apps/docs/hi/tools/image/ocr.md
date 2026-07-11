---
description: "AI-संचालित ऑप्टिकल कैरेक्टर रिकग्निशन का उपयोग करके इमेज से टेक्स्ट निकालें।"
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 47b6f369cfc3
---

# OCR / Text Extraction {#ocr-text-extraction}

AI-संचालित ऑप्टिकल कैरेक्टर रिकग्निशन का उपयोग करके इमेज से टेक्स्ट निकालें। कई भाषाओं और गुणवत्ता टियर का समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Processing:** सिंक्रोनस JSON प्रतिक्रिया। यदि `clientJobId` प्रदान किया गया हो, तो प्रगति की जानकारी SSE के माध्यम से भी दी जाती है।

**Model bundle:** `ocr` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | इमेज फ़ाइल (multipart) |
| quality | string | No | `"balanced"` | गुणवत्ता टियर: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | No | `"auto"` | भाषा संकेत: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | No | `true` | बेहतर OCR सटीकता के लिए इमेज को पूर्व-प्रोसेस करें |
| engine | string | No | - | अप्रचलित। इसके बजाय `quality` का उपयोग करें। `tesseract` को `fast` से, `paddleocr` को `balanced` से मैप करता है |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Progress (SSE, optional) {#progress-sse-optional}

यदि कोई `clientJobId` फ़ॉर्म फ़ील्ड प्रदान किया गया हो, तो प्रगति इवेंट स्ट्रीम किए जाते हैं:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notes {#notes}

- `ocr` मॉडल बंडल का इंस्टॉल होना आवश्यक है (5-6 GB)।
- OCR इमेज डाउनलोड URL के बजाय सीधे निकाला गया टेक्स्ट लौटाता है।
- एक फ़ॉलबैक श्रृंखला का उपयोग करता है: यदि कोई उच्च-गुणवत्ता टियर क्रैश हो जाता है (उदा., PaddleOCR segfault), तो यह स्वतः अगले निचले टियर के साथ पुनः प्रयास करता है।
- यदि कोई टियर क्रैश हुए बिना खाली टेक्स्ट लौटाता है, तो यह भी अगले टियर पर फ़ॉलबैक करता है।
- गुणवत्ता टियर इंजनों से मैप होते हैं: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR और HDR इनपुट प्रारूपों का समर्थन करता है।
