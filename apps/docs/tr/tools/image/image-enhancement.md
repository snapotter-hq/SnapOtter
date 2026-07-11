---
description: "Bir görseli analiz eden ve pozlamayı, kontrastı, beyaz dengesini, doygunluğu ve keskinliği düzelten tek tıkla otomatik geliştirme."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: 882095febc20
---

# Görsel Geliştirme {#image-enhancement}

Akıllı analizle tek tıkla otomatik iyileştirme. Görseli analiz eder ve pozlama, kontrast, beyaz dengesi, doygunluk, keskinlik ve gürültü azaltma düzeltmelerini uygular.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**İşleme:** Eşzamanlı (`createToolRoute` fabrikasını kullanır, sonucu doğrudan döndürür)

**Model paketi:** Temel geliştirme için hiçbiri gerekmez. `upscale-enhance` paketi (5-6 GB) yalnızca `deepEnhance` etkinleştirildiğinde kullanılır (SCUNet aracılığıyla yapay zeka gürültü giderme için).

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görsel dosyası (multipart) |
| mode | string | Hayır | `"auto"` | Geliştirme modu: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | Hayır | `50` | Genel geliştirme yoğunluğu (0-100) |
| corrections | object | Hayır | tümü `true` | Uygulanacak seçmeli düzeltmeler (aşağıya bakın) |
| deepEnhance | boolean | Hayır | `false` | Yapay zeka destekli gürültü gidermeyi etkinleştir (`noise-removal` aracının kurulu olmasını gerektirir) |

### Düzeltmeler Nesnesi {#corrections-object}

| Alan | Tür | Varsayılan | Açıklama |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Pozlamayı otomatik düzelt |
| contrast | boolean | `true` | Kontrastı otomatik düzelt |
| whiteBalance | boolean | `true` | Beyaz dengesini otomatik düzelt |
| saturation | boolean | `true` | Doygunluğu otomatik düzelt |
| sharpness | boolean | `true` | Otomatik keskinleştir |
| denoise | boolean | `true` | Hafif gürültü giderme |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Yanıt (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Analiz Uç Noktası {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

Bir görseli analiz eder ve düzeltmeleri uygulamadan düzeltme önerileri döndürür.

### Parametreler {#parameters-1}

| Parametre | Tür | Zorunlu | Açıklama |
|-----------|------|----------|-------------|
| file | file | Evet | Görsel dosyası (multipart) |

### Örnek İstek {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Yanıt (200 OK) {#response-200-ok-1}

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

## Notlar {#notes}

- Bu araç eşzamanlı `createToolRoute` fabrikasını kullanır, bu nedenle standart bir yanıt döndürür (202 async değil).
- `mode` parametresi, düzeltmelerin nasıl ağırlıklandırılacağını ayarlar (örn. portre modu ten tonlarına daha yumuşak davranır, manzara modu doygunluğu artırır).
- `deepEnhance` etkinleştirildiğinde ve `noise-removal` aracı (SCUNet) kurulu olduğunda, standart düzeltmelerden sonra ek bir yapay zeka gürültü giderme geçişi uygulanır.
- Analiz uç noktası, uygulanmadan önce hangi düzeltmelerin uygulanacağını önizlemek için kullanışlıdır.
- HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR giriş biçimlerini otomatik çözümleme yoluyla destekler.
