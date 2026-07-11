---
description: "Video karelerine bir metin filigranı işleyin."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: 6fcc828495a7
---

# Watermark Video {#watermark-video}

Bir videonun her karesine yapılandırılabilir konum, boyut, saydamlık ve renkle bir metin filigranı işleyin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Filigran metni (1-200 karakter) |
| position | string | No | `"br"` | Karedeki konum: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `36` | Piksel cinsinden yazı tipi boyutu (8-120) |
| opacity | number | No | `0.5` | Filigran saydamlığı (0.05-1) |
| color | string | No | `"#ffffff"` | Metin için hex renk (örneğin `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - Sol üst, **tc** - Üst orta, **tr** - Sağ üst
- **l** - Orta sol, **c** - Orta, **r** - Orta sağ
- **bl** - Sol alt, **bc** - Alt orta, **br** - Sağ alt

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
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

- Filigran, video karelerine kalıcı olarak işlenir ve işlemden sonra kaldırılamaz.
- Filigran, FFmpeg'e yerleşik bir sans-serif yazı tipi kullanır.
- Görüntü filigranları için bunun yerine image Watermark aracını kullanın.
