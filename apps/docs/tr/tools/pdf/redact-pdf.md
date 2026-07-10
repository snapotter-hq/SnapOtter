---
description: "Bir PDF'ten metin geçişlerini kalıcı olarak kaldırın (doğrulanmış gerçek redaksiyon)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: 0830d3b8abae
---

# PDF Redaksiyonu {#redact-pdf}

Doğrulanmış gerçek redaksiyon kullanarak belirtilen metin geçişlerini bir PDF'ten kalıcı olarak kaldırın. Redaksiyonu yapılan metin, yalnızca siyah bir kutuyla örtülmek yerine dosyadan tamamen kaldırılır.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| terms | string[] | Evet | - | Redaksiyonu yapılacak metin dizeleri (1-50 terim, her biri en fazla 200 karakter) |
| caseSensitive | boolean | Hayır | `false` | Eşleştirmenin büyük/küçük harfe duyarlı olup olmadığı |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notlar {#notes}

- Kabul edilen girdi biçimi: `.pdf`.
- Bu, sonucu doğrudan döndüren hızlı (eşzamanlı) bir araçtır.
- Bu, gerçek redaksiyon gerçekleştirir: eşleşen metin görsel olarak yalnızca gizlenmek yerine PDF içerik akışından kaldırılır.
- Yanıttaki `found` alanı kaç geçişin redaksiyonunun yapıldığını gösterir.
- Tek bir istekte en fazla 50 terimin redaksiyonunu yapabilirsiniz.
