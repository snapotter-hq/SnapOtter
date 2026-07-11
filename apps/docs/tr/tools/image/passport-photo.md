---
description: "Yüz algılama, arka plan kaldırma ve baskı sayfası döşemesiyle yapay zeka destekli pasaport ve kimlik fotoğrafı oluşturucu."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: 2979d2e1b061
---

# Pasaport Fotoğrafı {#passport-photo}

Yapay zeka destekli pasaport ve kimlik fotoğrafı oluşturucu. İki aşamalı iş akışı: analiz (yüz algılama + arka plan kaldırma) ardından oluşturma (kırpma, yeniden boyutlandırma ve baskı için döşeme).

## API Uç Noktaları {#api-endpoints}

Bu araç, analiz ve oluşturma için ayrı uç noktalara sahip iki aşamalı bir akış kullanır.

**Model paketleri:** `background-removal` ve `face-detection`

---

### Aşama 1: Analiz {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Yüz noktalarını algılar ve arka planı kaldırır. Ön uçun bir kırpma önizlemesi görüntülemesi için nokta verilerini ve bir önizleme döndürür.

#### Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| file | file | Evet | - | Görsel dosyası (çok parçalı) |
| clientJobId | string | Hayır | - | SSE aracılığıyla ilerleme takibi için isteğe bağlı iş kimliği |

#### Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Yanıt (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### İlerleme (SSE, isteğe bağlı) {#progress-sse-optional}

`clientJobId` sağlanırsa, ilerleme akıtılır (yüz algılama için %0-30, arka plan kaldırma için %30-95).

#### Hata: Yüz Algılanmadı (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Aşama 2: Oluştur {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Fotoğrafı kırpar, yeniden boyutlandırır ve isteğe bağlı olarak bir baskı sayfasına döşer. Aşama 1'den önbelleğe alınmış görselleri kullanır (yapay zeka yeniden çalıştırılmaz).

#### Parametreler (JSON gövdesi) {#parameters-json-body}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| jobId | string | Evet | - | Aşama 1'den iş kimliği |
| filename | string | Evet | - | Aşama 1'den orijinal dosya adı |
| countryCode | string | Evet | - | Pasaport belirtimi için ülke kodu (örn. `US`, `GB`, `IN`) |
| documentType | string | Hayır | `"passport"` | Belge türü (ülke belirtiminden) |
| bgColor | string | Hayır | `"#FFFFFF"` | Arka plan rengi hex değeri |
| printLayout | string | Hayır | `"none"` | Baskı kağıdı yerleşimi: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | Hayır | `0` | KB cinsinden maksimum dosya boyutu kısıtlaması (0 = sınır yok) |
| dpi | number | Hayır | `300` | Çıktı DPI'ı (72-1200) |
| customWidthMm | number | Hayır | - | Mm cinsinden özel fotoğraf genişliği (ülke belirtimini geçersiz kılar) |
| customHeightMm | number | Hayır | - | Mm cinsinden özel fotoğraf yüksekliği (ülke belirtimini geçersiz kılar) |
| zoom | number | Hayır | `1` | Yakınlaştırma katsayısı (0.5-3). 1'den büyük değerler daha sıkı kırpar |
| adjustX | number | Hayır | `0` | Yatay konum ayarı |
| adjustY | number | Hayır | `0` | Dikey konum ayarı |
| landmarks | object | Evet | - | Aşama 1 yanıtından noktalar nesnesi |
| imageWidth | number | Evet | - | Aşama 1 yanıtından görsel genişliği |
| imageHeight | number | Evet | - | Aşama 1 yanıtından görsel yüksekliği |

#### Örnek İstek {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### Yanıt (200 OK) {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### Temel Rota {#base-route}

`POST /api/v1/tools/image/passport-photo`

Doğru alt uç noktanın kullanılmasına yönelik yönlendirme döndürür.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Notlar {#notes}

- `background-removal` ve `face-detection` model paketlerinin kurulu olmasını gerektirir.
- Aşama 1 yapay zeka çalıştırır (yüz noktaları + arka plan kaldırma) ve sonuçları önbelleğe alır. Aşama 2 saf Sharp görsel işlemedir (hızlı, yapay zeka gerektirmez).
- Noktalar, normalleştirilmiş koordinatlar olarak döndürülür (görsel boyutlarına göre 0-1 aralığı).
- Analiz yanıtındaki `preview` alanı, hızlı görüntüleme için base64 kodlamalı bir PNG'dir (en fazla 800px genişlik).
- Ülke belirtimleri, resmi pasaport fotoğrafı gereksinimlerine dayalı belge boyutlarını, baş yüksekliği oranlarını ve göz çizgisi konumlandırmasını içerir.
- `printLayout` seçeneği, fotoğraflar arasında 2mm boşlukla 4x6\" veya A4 kağıt üzerinde döşenmiş bir sayfa oluşturur.
- `maxFileSizeKb` ayarlandığında, çıktı boyut sınırına sığacak şekilde yinelemeli olarak sıkıştırılır.
