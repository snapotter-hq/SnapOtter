---
description: "Bir PDF'in tüm sayfalarını kenar boşluklarına göre veya bir bölgeye kırpın."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: 933e1b6713c6
i18n_hash_version: 2
---

# PDF Kırp {#crop-pdf}

Bir PDF'in tüm sayfalarını her kenarda tek bir kenar boşluğuyla, her kenar için ayrı bir boşlukla ya da sayfanın bir köşesine basılmış kargo etiketi gibi bir bölgeye kadar kırpın.

## API Uç Noktası {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Bir PDF dosyası ve bir JSON `settings` alanı içeren multipart form verisini kabul eder.

## Parametreler {#parameters}

| Parametre | Tür | Zorunlu | Varsayılan | Açıklama |
|-----------|------|----------|---------|-------------|
| mode | string | Hayır | `uniform` | `uniform`, `sides` veya `region` |
| margin | number | Hayır | `20` | `uniform` modu: her kenar için punto cinsinden kırpma boşluğu (0-2000) |
| top, right, bottom, left | number | Hayır | `0` | `sides` modu: her kenar için punto cinsinden ayrı kırpma boşluğu (0-2000) |
| x, y | number | Hayır | `0` | `region` modu: bölgenin sayfanın sol ve üst kenarlarına punto cinsinden uzaklığı |
| width, height | number | Hayır | `288`, `432` | `region` modu: bölgenin punto cinsinden boyutu (4x6 in etiket) |

## Örnek İstek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Yalnızca her sayfanın sol üst köşesindeki 4x6 in etiketi tutun:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Örnek Yanıt {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notlar {#notes}

- Tüm değerler PDF puntosu cinsindendir (1 punto = 1/72 inç). Bir US Letter sayfası 612 x 792 puntodur.
- Her mod yalnızca kendi alanlarını okur, bu yüzden yalnızca `margin` gönderen bir istek çalışmaya devam eder.
- Bir bölge her sayfanın sol üst köşesinden ölçülür ve her sayfanın içine sığmalıdır. Kenar boşlukları her sayfadan bir miktar içerik bırakmalıdır. Aksi halde istek `400` ile başarısız olur.
- Döndürülmüş görüntülenecek şekilde ayarlanmış bir sayfada konumlar ve kenarlar, sayfanın görüntülendiği haline göre belirlenir; yani bir bölgenin sol üst köşesi, döndürülmüş sayfanın sol üst köşesidir.
- Her mod tam medya kutusundan ölçer, bu yüzden zaten kırpılmış bir sayfayı kırpmak tam sayfadan yeniden başlar. `0` değerinde tek tip bir kenar boşluğu tüm medya kutusunu gösterir.
