---
description: "Bir ses dosyasını geriye doğru çalacak şekilde tersine çevirin."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 0e1a166d2681
---

# Reverse Audio {#reverse-audio}

Bir ses dosyasını geriye doğru çalacak şekilde tersine çevirin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Bir ses dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. Ses dosyasının tamamı tersine çevrilir.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notlar {#notes}

- Ses parçasının tamamı sondan başa doğru tersine çevrilir.
- Çıktı genellikle girdi konteynerini korur. AAC girdisi M4A olarak yazılır ve desteklenmeyen yalnızca-çözümleme (decode-only) girdileri MP3'e geri döner.
