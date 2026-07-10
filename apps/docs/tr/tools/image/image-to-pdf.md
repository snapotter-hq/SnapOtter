---
description: "Bir veya daha fazla görseli sayfa boyutu, yönlendirme ve hedef dosya boyutu seçenekleriyle bir PDF belgesinde birleştirin."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: 449b1e21adb2
---

# Görselden PDF'e {#image-to-pdf}

Bir veya daha fazla görseli bir PDF belgesinde birleştirin. Birden fazla sayfa boyutunu, yönlendirmeyi, kenar boşluklarını ve kalite ayarı yoluyla isteğe bağlı dosya boyutu hedeflemeyi destekler.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

Bir veya daha fazla görsel dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| pageSize | string | Hayır | `"A4"` | Sayfa boyutu: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | Hayır | `"portrait"` | Sayfa yönlendirmesi: `portrait` veya `landscape` |
| margin | number | Hayır | `20` | Punto cinsinden sayfa kenar boşluğu (0-500) |
| targetSize | object | Hayır | - | Hedef dosya boyutu kısıtlaması (aşağıya bakın) |
| collate | boolean | Hayır | `true` | Tüm görselleri tek bir PDF'te birleştir. `false` ise görsel başına bir PDF oluşturur. |

### Hedef Boyut Nesnesi {#target-size-object}

| Alan | Tür | Zorunlu | Açıklama |
|-------|------|----------|-------------|
| value | number | Evet | Hedef boyut değeri |
| unit | string | Evet | Birim: `KB` veya `MB` |

Minimum hedef boyut 50 KB'dir.

## Örnek İstek {#example-request}

Temel çok görselli PDF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

Dosya boyutu hedefiyle:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

Görsel başına bir PDF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Örnek Yanıt (Harmanlanmış) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Örnek Yanıt (Harmanlanmamış) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Örnek Yanıt (Hedef Boyutla) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Notlar {#notes}

- Görseller sayfada ortalanır ve en boy oranı korunurken kenar boşluklarına sığacak şekilde ölçeklendirilir. Görseller asla büyütülmez.
- `collate` değeri `false` olduğunda, her görsel ayrı bir PDF dosyası olur ve indirme, tüm PDF'leri içeren bir ZIP arşividir.
- Hedef boyut özelliği, bütçeye sığan en iyi kaliteyi bulmak için JPEG kalite düzeyleri (10-95) üzerinde yinelemeli ikili arama kullanır.
- Saydam görseller, PDF'e gömülmeden önce beyaza düzleştirilir.
- Desteklenen giriş biçimleri: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG ve daha fazlası.
- EXIF yönlendirmesi gömülmeden önce otomatik olarak uygulanır.
