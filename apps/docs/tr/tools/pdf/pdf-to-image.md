---
description: "PDF sayfalarını yüksek kaliteli görüntülere dönüştürün."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: d7d175e00ba2
---

# PDF'ten Görüntüye {#pdf-to-image}

PDF sayfalarını yüksek kaliteli raster görüntülere dönüştürün. Sayfa seçimini, birden fazla çıktı biçimini, DPI denetimini ve renk modlarını destekler. Dönüştürmeden önce PDF'leri incelemek için bilgi ve önizleme alt rotalarını içerir.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| format | string | Hayır | `"png"` | Çıktı biçimi: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | Hayır | 150 | İşleme çözünürlüğü (36 ile 2400). Daha yüksek DPI daha büyük, daha ayrıntılı görüntüler üretir. |
| quality | number | Hayır | 85 | Kayıplı biçimler için çıktı kalitesi (1 ile 100) |
| colorMode | string | Hayır | `"color"` | Renk modu: `color`, `grayscale`, `bw` (siyah beyaz eşiği) |
| pages | string | Hayır | `"all"` | Sayfa seçimi: `all`, tek sayfa (`3`), aralık (`1-5`) veya virgülle ayrılmış (`1,3,5-8`) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Bilgi Alt Rotası {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

Herhangi bir sayfayı işlemeden bir PDF'in sayfa sayısını döndürür.

### Bilgi İsteği {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Bilgi Yanıtı {#info-response}

```json
{
  "pageCount": 10
}
```

## Önizleme Alt Rotası {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

Tüm sayfaların düşük çözünürlüklü JPEG küçük resimlerini base64 veri URL'leri olarak döndürür. Bir sayfa seçim arayüzü oluşturmak için kullanışlıdır.

### Önizleme İsteği {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Önizleme Yanıtı {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notlar {#notes}

- PDF işleme için MuPDF kullanır ve doğru yazı tipi işleme ile vektör grafikleri sağlayarak yüksek doğrulukta çıktı verir.
- Parola korumalı PDF'ler desteklenmez ve bir 400 hatası döndürür.
- `pages` parametresi esnek söz dizimini destekler:
  - `"all"` veya `""` - tüm sayfalar
  - `"3"` - tek sayfa
  - `"1-5"` - sayfa aralığı (dahil)
  - `"1,3,5-8"` - karışık tekil sayfalar ve aralıklar
- Sayfa numaraları 1 tabanlıdır. Belge uzunluğunun ötesindeki sayfaları belirtmek bir 400 hatası döndürür.
- Ana uç nokta her zaman hem tekil sayfa indirmelerini hem de seçili tüm sayfaları içeren bir ZIP dosyasını oluşturur.
- Önizleme uç noktası 72 DPI'da işler ve hızlı küçük resim oluşturma için 300px genişliğe ölçekler. Küçük resimler %60 kalitede JPEG'dir.
- Önizleme uç noktası `MAX_PDF_PAGES` sunucu yapılandırmasına uyar ve kaç küçük resim oluşturulacağını sınırlar.
- Yüksek DPI'daki büyük belgeler için işleme süresi orantılı olarak artar. Web kullanımı için daha düşük DPI (150), baskı için daha yüksek DPI (300-600) kullanmayı düşünün.
