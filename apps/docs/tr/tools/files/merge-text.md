---
description: "Birden fazla metin veya Markdown dosyasını seçtiğiniz sırayla tek dosyada birleştirin."
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: df30ae6daea3
i18n_hash_version: 2
---

# Metin Dosyalarını Birleştir {#merge-text}

Birden fazla metin veya Markdown dosyasını tek bir dosyada birleştirin. Dosyalar yükleme sırasıyla eklenir, bu yüzden sıra önemliyse çalıştırmadan önce dosya listesinde yeniden sıralayın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

İki veya daha fazla metin dosyası ve isteğe bağlı bir `settings` JSON dizesi içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | Dosyaların arasına konan şey: `"blank-line"`, `"rule"` (bir `---` satırı) veya `"filename-heading"` (her dosyanın adı başlık olarak) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Notlar {#notes}

- `.txt`, `.md`, `.markdown`, `.csv` ve `.log` dosyalarını kabul eder, istek başına 2 ile 50 arasında.
- Her dosya UTF-8 metin olmalıdır. İkili veya UTF-8 olmayan bir dosya reddedilir ve adı hatada gösterilir.
- Tüm girdilerin uzantısı aynıysa çıktı bunu korur (`merged.md`, `merged.log`). Karışık girdiler `merged.txt` üretir.
- `filename-heading` ile Markdown çıktısı `# name.md` başlıklarını, düz metin çıktısı ise `==> name.txt <==` işaret satırlarını kullanır.
- Ayırıcının belgeler arasında düzgün durması için her dosyanın sonundaki boş satırlar kırpılır. Baştaki bayt sırası işareti atılır.
- CSV dosyaları düz metin olarak birleştirilir. Tabloları tek bir başlık satırıyla birleştirmek için [CSV'leri Birleştir](./merge-csvs) aracını kullanın.
- `.eml` e-posta dosyaları henüz desteklenmiyor.
