---
description: "किसी वीडियो को तेज़ या धीमा करें।"
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: 6e303ee0a840
---

# Video Speed {#video-speed}

ऑडियो पिच को सुरक्षित रखने के विकल्प के साथ किसी वीडियो को तेज़ या धीमा करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | गति गुणक (0.25-4)। 1 से ऊपर के मान तेज़ करते हैं, नीचे के धीमा करते हैं |
| keepPitch | boolean | No | `true` | गति बदलते समय ऑडियो पिच को सुरक्षित रखें |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- `2` का factor प्लेबैक गति दोगुनी कर देता है (अवधि आधी)। `0.5` का factor प्लेबैक गति आधी कर देता है (अवधि दोगुनी)।
- जब `keepPitch` `true` हो, तो ऑडियो को समय-अनुसार खींचा जाता है ताकि आवाज़ें स्वाभाविक लगें। जब `false`, तो पिच गति के अनुपात में शिफ्ट होती है।
- मान्य सीमा 0.25x से 4x है।
