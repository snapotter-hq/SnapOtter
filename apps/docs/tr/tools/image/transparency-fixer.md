---
description: "Sahte saydam PNG'leri AI matlama (BiRefNet) ile düzelterek gerçek alfa üretin, ayrıca defringe kenar temizliği yapın."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: cf0968972183
---

# PNG Saydamlık Düzeltici {#png-transparency-fixer}

Sahte saydam PNG'leri tek tıkla düzeltin. Gerçek alfa saydamlığı üretmek için AI matlama (BiRefNet HR Matting modeli) kullanır, kenarları temizlemek için defringe son işleme uygular.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**İşleme:** Eşzamansız (202 döner, durum için SSE aracılığıyla `/api/v1/jobs/{jobId}/progress` üzerinden sorgulanır)

**Model paketi:** `background-removal` (4-5 GB)

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görüntü dosyası (multipart) |
| defringe | number | Hayır | `30` | Defringe yoğunluğu (0-100). Kenarlar çevresindeki yarı saydam saçak piksellerini kaldırır |
| outputFormat | string | Hayır | `"png"` | Çıktı biçimi: `png` veya `webp` |
| removeWatermark | boolean | Hayır | `false` | Filigran kaldırma ön işlemesi uygula (medyan filtresi) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
```

## Yanıt {#response}

### İlk Yanıt (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### İlerleme (`/api/v1/jobs/{jobId}/progress` üzerinde SSE) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Nihai Sonuç (SSE aracılığıyla) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Notlar {#notes}

- `background-removal` model paketinin kurulmuş olmasını gerektirir (4-5 GB).
- Yüksek kaliteli alfa matlama için birincil model olarak `birefnet-hr-matting` kullanır. HR modeli bellek yetersizliğine düşerse `birefnet-general` modeline geri döner.
- `defringe` seçeneği, AI matlamanın bazen saç, kürk ve ince kenarlar çevresinde bıraktığı yarı saydam saçak piksellerini kaldırır. Alfa kanalını bulanıklaştırıp düşük güvenilirlikli pikselleri sıfırlayarak çalışır.
- `removeWatermark` seçeneği, bir medyan filtresi ön işleme adımı uygular. Bu, özel bir filigran kaldırma aracı değil, temel bir filigran azaltmadır.
- Yalnızca PNG veya kayıpsız WebP çıktısı verir (her ikisi de alfa saydamlığını destekler).
- HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR giriş biçimlerini otomatik çözme yoluyla destekler.
