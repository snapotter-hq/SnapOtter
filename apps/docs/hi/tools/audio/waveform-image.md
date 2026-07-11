---
description: "किसी ऑडियो फ़ाइल से एक PNG इमेज के रूप में वेवफ़ॉर्म विज़ुअलाइज़ेशन उत्पन्न करें।"
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: ee31a700bdbe
---

# Waveform Image {#waveform-image}

किसी ऑडियो फ़ाइल से एक PNG इमेज के रूप में वेवफ़ॉर्म विज़ुअलाइज़ेशन उत्पन्न करें, कॉन्फ़िगर करने योग्य आयामों और रंग के साथ।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

एक ऑडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `1024` | पिक्सेल में इमेज की चौड़ाई (256 से 3840) |
| height | integer | No | `256` | पिक्सेल में इमेज की ऊंचाई (64 से 1080) |
| color | string | No | `"#4f46e5"` | वेवफ़ॉर्म हेक्स रंग (जैसे `"#4f46e5"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes {#notes}

- इनपुट ऑडियो फ़ॉर्मेट की परवाह किए बिना आउटपुट हमेशा एक PNG इमेज होता है।
- वेवफ़ॉर्म एक पारदर्शी पृष्ठभूमि पर रेंडर किया जाता है।
- थंबनेल, सोशल मीडिया पूर्वावलोकन, या वेब पेजों में एम्बेड करने के लिए उपयोगी।
