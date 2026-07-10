---
description: "Ses yüksekliğini yayın standardı seviyelerine (EBU R128) eşitleyin."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: e5d9db14541e
---

# Normalize Audio {#normalize-audio}

EBU R128 normalleştirmesini (-16 LUFS) kullanarak ses yüksekliğini yayın standardı seviyelerine eşitleyin.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Bir ses dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

Bu aracın yapılandırılabilir parametresi yoktur. EBU R128 yükseklik normalleştirmesini otomatik olarak uygular.

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
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

- -16 LUFS'i hedefleyen EBU R128 yükseklik standardını kullanır.
- Tutarlı yüksekliğin önemli olduğu podcast'ler, sesli kitaplar ve yayın içeriği için idealdir.
- Kaynak örnekleme hızı çıktıda korunur.
- Çıktı genellikle girdi konteynerini korur. AAC girdisi M4A olarak yazılır ve desteklenmeyen yalnızca-çözümleme (decode-only) girdileri MP3'e geri döner.
