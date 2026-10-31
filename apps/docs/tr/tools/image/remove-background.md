---
description: "İsteğe bağlı efektlerle (bulanıklık, gölge, gradyan, özel arka plan) yapay zeka destekli arka plan kaldırma."
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: 08c2679cef4e
---

# Arka Planı Kaldır {#remove-background}

İsteğe bağlı efektlerle (bulanıklık, gölge, gradyan, özel arka plan) yapay zeka destekli arka plan kaldırma.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**İşleme:** Eşzamansız (202 döndürür, durum için SSE aracılığıyla `/api/v1/jobs/{jobId}/progress` sorgulayın)

**Model paketi:** `background-removal` (4-5 GB)

## Parametreler {#parameters}

Aşama 1 arka planı kaldırır ve saydam PNG maskesini ve orijinal görüntüyü önbelleğe alır. Arka plan değiştirme, bulanıklık, açılır gölge ve çıktı biçimi dönüştürme [Aşama 2'de (`/api/v1/tools/image/remove-background/effects`)](#effects-endpoint-phase-2) uygulanır (ya da `remove-background` bir işlem hattı adımı veya toplu iş olarak çalıştırıldığında); bu alanları Aşama 1'e geçirmek 400 döndürür.

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görsel dosyası (çok parçalı) |
| model | string | Hayır | - | Kullanılacak yapay zeka model çeşidi |
| edgeRefine | integer | Hayır | - | Kenar iyileştirme seviyesi (0-3) |
| decontaminate | boolean | Hayır | - | Kenarlardan renk taşmasını kaldır |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
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
| backgroundImage | file | `backgroundType` değeri `image` olduğunda zorunlu | - | Özel arka plan görseli |

#### Ayarlar JSON alanları {#settings-json-fields}

| Alan | Tür | Zorunlu | Varsayılan | Açıklama |
|-------|------|----------|---------|-------------|
| jobId | string | Evet | - | Aşama 1'den iş kimliği |
| filename | string | Evet | - | Aşama 1'den orijinal dosya adı |
| backgroundType | string | Hayır | `"transparent"` | Şunlardan biri: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | `backgroundType` değeri `color` olduğunda zorunlu | - | Hex renk: `#RRGGBB` veya `#RGB` (`#` isteğe bağlı) |
| gradientColor1 | string | `backgroundType` değeri `gradient` olduğunda zorunlu | - | Birinci gradyan rengi, `backgroundColor` gibi hex |
| gradientColor2 | string | `backgroundType` değeri `gradient` olduğunda zorunlu | - | İkinci gradyan rengi, `backgroundColor` gibi hex |
| gradientAngle | number | Hayır | - | Derece cinsinden gradyan açısı |
| blurEnabled | boolean | Hayır | - | Öznenin arkasındaki orijinal arka planı bulanıklaştır (`backgroundType: "blur"` bunu zımnen içerir) |
| blurIntensity | number | Hayır | - | Bulanıklık yoğunluğu (0-100) |
| shadowEnabled | boolean | Hayır | - | Özne üzerinde açılır gölgeyi etkinleştir |
| shadowOpacity | number | Hayır | `35` | Gölge opaklığı (0-100); `shadowEnabled` true olduğunda kullanılır |
| outputFormat | string | Hayır | `"png"` | Çıktı biçimi: `png`, `webp` veya `avif` |

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

#### Hata: Arka Plan Kaldırma Süresi Doldu (410) {#error-background-removal-expired-410}

Efektler uç noktası, Aşama 1'in `jobId` için sakladığı maskeden ve orijinal görselden çalışır. Saklanan çıktılar bir süre sonra temizlenir, bu yüzden iki çağrı arasında çok fazla zaman geçerse bunlar yok olur. Aşama 1'i aynı görselle yeniden çalıştırın ve döndürdüğü `jobId` değerini kullanın.

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

Saklanan bir dosyayı adlandıramayan bir `jobId` veya `filename` (bir yol ayırıcı, `..`, boş bir dize) 400 yanıtı verir.

## Notlar {#notes}

- `background-removal` model paketinin kurulu olmasını gerektirir (4-5 GB).
- Aşama 1, saydam maskeyi ve orijinal görseli önbelleğe alır; böylece Aşama 2 (efektler) yapay zeka modelini yeniden çalıştırmadan farklı arka planları anında yeniden uygulayabilir.
- HEIC/HEIF, RAW, TGA, PSD, EXR ve HDR girdi biçimlerini otomatik çözme yoluyla destekler.
- EXIF döndürmesi işlemden önce otomatik olarak düzeltilir.
