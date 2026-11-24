---
description: "Bir PDF'i Markdown'a dönüştürün; PDF'de varsa başlıkları, listeleri ve tabloları koruyun."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: c4f40c326857
i18n_hash_version: 2
---

# PDF'den Markdown'a {#pdf-to-markdown}

Bir PDF'i wiki'ye, statik bir siteye veya bir LLM işlem hattına bırakabileceğiniz Markdown dosyasına dönüştürün.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Bir PDF dosyası içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Bir PDF yükleyin, karşılığında `.md` dosyası alın.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

Büyük bir PDF eşzamanlı bekleme süresinden uzun sürebilir. API bu durumda `202` ile yanıt verir, yanıtta `jobId` bulunur ve ilerlemeyi `/api/v1/jobs/{jobId}/progress` adresinden izlersiniz.

## Neler korunur {#what-gets-kept}

PDF yapıyı değil, konumlandırılmış metni saklar; bu yüzden dönüştürücü yapıyı kendisi çıkarır:

- **Başlıklar.** Gövde metninden belirgin biçimde büyük yazılmış kısa satırlar, tüm belgedeki boyut sırasına göre `#` ile `######` arasında başlıklara dönüşür.
- **Listeler.** Madde işareti veya numarayla başlayan satırlar liste öğesi olur.
- **Kalın, italik ve bağlantılar.** Satır içinde korunur. Yalnızca `http`, `https` ve `mailto` bağlantıları kalır.
- **Tablolar.** Çizgilerle çizilmiş tablolar Markdown tablosu olarak çıkar. Yalnızca boşluklarla hizalanmış tablolar genellikle düz paragraf olarak gelir.

Görseller atılır. Çok sütunlu düzenler ve alışılmadık sayfa tasarımları elinden geldiğince işlenir; bu yüzden çıktıya güvenmeden önce kontrol edin.

## Notlar {#notes}

- Kabul edilen girdi biçimi: `.pdf`.
- Yanıttaki `chars` alanı, Markdown çıktısının uzunluğudur.
- Taranmış bir PDF'de dönüştürülecek metin katmanı yoktur. Araç boş dosya döndürmek yerine onu `422` ve `NO_TEXT_LAYER` koduyla reddeder. Bunlar için [PDF OCR](./ocr-pdf) aracını kullanın.
- Gidiş dönüş için [Markdown'dan PDF'e](../files/markdown-to-pdf), [Markdown'dan DOCX'e](../files/markdown-to-docx) ve [Markdown'dan HTML'e](../files/markdown-to-html) araçları `.md` dosyalarını okur.
