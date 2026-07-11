---
description: "PDF belge meta verilerini okuyun ve yazın."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: 675d30ac3468
---

# PDF Meta Verileri {#pdf-metadata}

Başlık, yazar, konu ve anahtar kelimeler gibi PDF belge meta veri alanlarını okuyun ve güncelleyin. Herhangi bir ayar sağlanmadığında mevcut meta veriler değiştirilmeden döndürülür.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Bir PDF dosyası ve isteğe bağlı bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| title | string | Hayır | - | Belge başlığı (en fazla 500 karakter) |
| author | string | Hayır | - | Belge yazarı (en fazla 500 karakter) |
| subject | string | Hayır | - | Belge konusu (en fazla 500 karakter) |
| keywords | string | Hayır | - | Belge anahtar kelimeleri (en fazla 500 karakter) |

Tüm parametreler isteğe bağlıdır. Atlanan alanlar değiştirilmeden bırakılır.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notlar {#notes}

- Kabul edilen girdi biçimi: `.pdf`.
- Bu, sonucu doğrudan döndüren hızlı (eşzamanlı) bir araçtır.
- Yanıttaki `metadata` alanı, varsa güncellemelerden sonraki nihai meta verileri içerir.
- Meta verileri değiştirmeden okumak için `settings` alanını atlayın veya boş bir nesne gönderin.
- Her meta veri alanı 500 karakterle sınırlıdır.
