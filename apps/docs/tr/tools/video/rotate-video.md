---
description: "Bir videoyu döndürün veya çevirin."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: f43adf749503
---

# Rotate Video {#rotate-video}

Bir videoyu 90, 180 veya 270 derece döndürün ya da yatay veya dikey olarak çevirin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | Uygulanacak dönüşüm: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - 90 derece saat yönünde döndür
- **ccw90** - 90 derece saat yönünün tersine döndür
- **180** - 180 derece döndür
- **hflip** - Yatay olarak çevir (ayna)
- **vflip** - Dikey olarak çevir

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- 90 veya 270 derecelik döndürmeler videonun genişliğini ve yüksekliğini yer değiştirir.
- Çevirme işlemleri (hflip, vflip) video boyutlarını değiştirmez.
