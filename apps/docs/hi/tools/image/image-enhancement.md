---
description: "एक-क्लिक ऑटो-एन्हांस जो किसी छवि का विश्लेषण करता है और exposure, contrast, white balance, saturation और sharpness को ठीक करता है।"
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: 395f33828221
---

# Image Enhancement {#image-enhancement}

स्मार्ट विश्लेषण के साथ एक-क्लिक ऑटो-सुधार। छवि का विश्लेषण करता है और exposure, contrast, white balance, saturation, sharpness और denoising सुधार लागू करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**Processing:** समकालिक (`createToolRoute` factory का उपयोग करता है, परिणाम सीधे लौटाता है)

**Model bundle:** बुनियादी एन्हांसमेंट के लिए कोई आवश्यक नहीं। `upscale-enhance` bundle (5-6 GB) का उपयोग केवल तब किया जाता है जब `deepEnhance` सक्षम हो (SCUNet के माध्यम से AI noise removal के लिए)।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | हाँ | - | Image फ़ाइल (multipart) |
| mode | string | नहीं | `"auto"` | एन्हांसमेंट मोड: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | नहीं | `50` | समग्र एन्हांसमेंट तीव्रता (0-100) |
| corrections | object | नहीं | सभी `true` | लागू करने के लिए चयनात्मक सुधार (नीचे देखें) |
| deepEnhance | boolean | नहीं | `false` | AI-संचालित noise removal सक्षम करें (`noise-removal` टूल इंस्टॉल होना आवश्यक) |

### Corrections Object {#corrections-object}

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Exposure को स्वतः-सुधारें |
| contrast | boolean | `true` | Contrast को स्वतः-सुधारें |
| whiteBalance | boolean | `true` | White balance को स्वतः-सुधारें |
| saturation | boolean | `true` | Saturation को स्वतः-सुधारें |
| sharpness | boolean | `true` | स्वतः-शार्पन करें |
| denoise | boolean | `true` | हल्का denoising |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Analyze Endpoint {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

किसी छवि का विश्लेषण करता है और उन्हें लागू किए बिना सुधार अनुशंसाएँ लौटाता है।

### Parameters {#parameters-1}

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| file | file | हाँ | Image फ़ाइल (multipart) |

### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Response (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Notes {#notes}

- यह टूल समकालिक `createToolRoute` factory का उपयोग करता है, इसलिए यह एक मानक प्रतिक्रिया लौटाता है (202 async नहीं)।
- `mode` parameter समायोजित करता है कि सुधारों को कैसे भारित किया जाए (जैसे, portrait मोड त्वचा टोन पर अधिक कोमल होता है, landscape मोड saturation बढ़ाता है)।
- जब `deepEnhance` सक्षम हो और `noise-removal` टूल (SCUNet) इंस्टॉल हो, तो मानक सुधारों के बाद एक अतिरिक्त AI denoising पास लागू किया जाता है।
- analyze endpoint यह पूर्वावलोकन करने के लिए उपयोगी है कि प्रतिबद्ध करने से पहले कौन से सुधार लागू किए जाएँगे।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR और HDR इनपुट प्रारूपों का समर्थन करता है।
