---
description: "İsteğe bağlı efektlerle (bulanıklık, gölge, gradyan, özel arka plan) yapay zeka destekli arka plan kaldırma."
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: 59966a2154c6
---

# Arka Planı Kaldır {#remove-background}

İsteğe bağlı efektlerle (bulanıklık, gölge, gradyan, özel arka plan) yapay zeka destekli arka plan kaldırma.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**İşleme:** Eşzamansız (202 döndürür, durum için SSE aracılığıyla `/api/v1/jobs/{jobId}/progress` sorgulayın)

**Model paketi:** `background-removal` (4-5 GB)

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görsel dosyası (çok parçalı) |
| model | string | Hayır | - | Kullanılacak yapay zeka model çeşidi |
| backgroundType | string | Hayır | `"transparent"` | Şunlardan biri: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Hayır | - | Düz arka plan için hex rengi |
| gradientColor1 | string | Hayır | - | Birinci gradyan rengi |
| gradientColor2 | string | Hayır | - | İkinci gradyan rengi |
| gradientAngle | number | Hayır | - | Derece cinsinden gradyan açısı |
| blurEnabled | boolean | Hayır | - | Arka plan bulanıklık efektini etkinleştir |
| blurIntensity | number | Hayır | - | Bulanıklık yoğunluğu (0-100) |
| shadowEnabled | boolean | Hayır | - | Özne üzerinde açılır gölgeyi etkinleştir |
| shadowOpacity | number | Hayır | - | Gölge opaklığı (0-100) |
| outputFormat | string | Hayır | - | Çıktı biçimi: `png`, `webp` veya `avif` |
| edgeRefine | integer | Hayır | - | Kenar iyileştirme seviyesi (0-3) |
| decontaminate | boolean | Hayır | - | Kenarlardan renk taşmasını kaldır |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
```

## Yanıt {#response}

### İlk Yanıt (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### İlerleme (`/api/v1/jobs/{jobId}/progress` konumunda SSE) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Nihai Sonuç (SSE aracılığıyla) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Efektler Uç Noktası (Aşama 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Yapay zeka modelini yeniden çalıştırmadan arka plan efektlerini yeniden uygular. Aşama 1'den önbelleğe alınmış maskeyi ve orijinali kullanır.

### Parametreler {#parameters-1}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| settings | JSON | Evet | - | Efekt ayarlarını içeren JSON (aşağıya bakın) |
| backgroundImage | file | Hayır | - | Özel arka plan görseli (backgroundType `image` olduğunda) |

#### Ayarlar JSON alanları {#settings-json-fields}

| Alan | Tür | Zorunlu | Açıklama |
|-------|------|----------|-------------|
| jobId | string | Evet | Aşama 1'den iş kimliği |
| filename | string | Evet | Aşama 1'den orijinal dosya adı |
| backgroundType | string | Hayır | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Hayır | Düz arka plan için hex rengi |
| gradientColor1 | string | Hayır | Birinci gradyan rengi |
| gradientColor2 | string | Hayır | İkinci gradyan rengi |
| gradientAngle | number | Hayır | Derece cinsinden gradyan açısı |
| blurEnabled | boolean | Hayır | Arka plan bulanıklığını etkinleştir |
| blurIntensity | number | Hayır | Bulanıklık yoğunluğu (0-100) |
| shadowEnabled | boolean | Hayır | Açılır gölgeyi etkinleştir |
| shadowOpacity | number | Hayır | Gölge opaklığı (0-100) |
| outputFormat | string | Hayır | `png`, `webp` veya `avif` |

### Örnek İstek {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Yanıt (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## Notlar {#notes}

- `background-removal` model paketinin kurulu olmasını gerektirir (4-5 GB).
- Aşama 1, saydam maskeyi ve orijinal görseli önbelleğe alır; böylece Aşama 2 (efektler) yapay zeka modelini yeniden çalıştırmadan farklı arka planları anında yeniden uygulayabilir.
- HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR girdi biçimlerini otomatik çözme yoluyla destekler.
- EXIF döndürmesi işlemden önce otomatik olarak düzeltilir.
