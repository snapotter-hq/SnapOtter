---
description: "Bir görsel tuvalini AI outpainting ile genişletin, her yöne uzatın ve yeni alanları özgün görsele uyacak şekilde doldurun."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: 88b5666e7cec
---

# AI Tuval Genişletme {#ai-canvas-expand}

Bir görselin tuvalini AI destekli dolgu (outpainting) ile genişletin. Görseli her yöne uzatır ve yeni alanları mevcut görselle eşleşen AI tarafından üretilen içerikle doldurur.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**İşleme:** Eşzamansız (202 döndürür, durum için `/api/v1/jobs/{jobId}/progress` SSE üzerinden yoklanır)

**Model paketi:** `object-eraser-colorize` (1-2 GB)

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | dosya | Evet | - | Görsel dosyası (multipart) |
| extendTop | tam sayı | Hayır | `0` | Üstten uzatılacak piksel sayısı |
| extendRight | tam sayı | Hayır | `0` | Sağdan uzatılacak piksel sayısı |
| extendBottom | tam sayı | Hayır | `0` | Alttan uzatılacak piksel sayısı |
| extendLeft | tam sayı | Hayır | `0` | Soldan uzatılacak piksel sayısı |
| tier | dize | Hayır | `"balanced"` | Kalite kademesi: `fast`, `balanced`, `high` |
| format | dize | Hayır | `"auto"` | Çıktı biçimi: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | tam sayı | Hayır | `95` | Çıktı kalitesi (1-100) |

En az bir uzatma yönü 0'dan büyük olmalıdır.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
```

## Yanıt {#response}

### İlk Yanıt (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### İlerleme (`/api/v1/jobs/{jobId}/progress` adresinde SSE) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Nihai Sonuç (SSE üzerinden) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Notlar {#notes}

- `object-eraser-colorize` model paketinin yüklü olmasını gerektirir (1-2 GB).
- Genişletilen bölgeler için içerik üretmek amacıyla LaMa tabanlı outpainting kullanır.
- `tier` parametresi hız ile kaliteyi dengeler: `fast` sonuçları olası eserlerle hızlıca üretir, `high` daha uzun sürer ancak daha pürüzsüz ve tutarlı dolgular üretir.
- Uzatma değerleri piksel cinsindendir. Nihai görsel boyutları şöyle olur: özgün genişlik + extendLeft + extendRight, özgün yükseklik + extendTop + extendBottom.
- Tarayıcıda önizlenemeyen çıktı biçimleri (HEIC, JXL, TIFF) için ana çıktının yanında bir WebP önizlemesi üretilir.
- Otomatik çözme yoluyla HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR giriş biçimlerini destekler.
