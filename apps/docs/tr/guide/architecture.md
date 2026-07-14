---
description: "SnapOtter'ın monorepo yapısı, uygulama ve paket mimarisi, istek yaşam döngüsü ve kaynak ayak izi."
i18n_output_hash: b03ab6eecf2d
i18n_source_hash: 733cb3c10884
i18n_provenance: human
---

# Mimari {#architecture}

SnapOtter, pnpm workspaces ve Turborepo ile yönetilen bir monorepo'dur. 3 konteynerli bir Docker Compose yığını olarak dağıtılır: SnapOtter uygulama imajı, PostgreSQL 17 ve Redis 8.

## Proje yapısı {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## Paketler {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

[Sharp](https://sharp.pixelplumbing.com/) üzerine inşa edilmiş temel görüntü işleme kütüphanesi. Tüm AI olmayan işlemleri yönetir: yeniden boyutlandırma, kırpma, döndürme, çevirme, dönüştürme, sıkıştırma, meta veri çıkarma ve renk ayarlamaları (parlaklık, kontrast, doygunluk, gri tonlama, sepya, tersleme, renk kanalları).

Bu paketin ağ bağımlılığı yoktur ve tamamen işlem içinde çalışır.

### `@snapotter/ai` {#snapotter-ai}

Yerel ve Python ML çalışma zamanlarını çağıran bir köprü katmanı. Çoğu Python aracı, ağır kitaplıkları (PIL, NumPy, MediaPipe, rembg) önceden içe aktaran kalıcı bir dispatcher kullanır, böylece sonraki çağrılar içe aktarma yükünü atlar. OCR, bu değiştirilebilir paylaşılan ortamdan yalıtılmıştır: `fast`, yerel Tesseract'yi çağırırken, `balanced` ve `best`, aktif değişmez RapidOCR/ONNX nesline sabitlenmiş özel bir kalıcı JSONL dispatcher kullanır. Her istek bir generation lease içerir. Etkinleştirme önce bir aday üzerinde smoke test çalıştırır, ardından atomik olarak dispatcher'ye geçiş yapar. Önceki dispatcher, oluşturulmadan önce çöp toplama işlemine tabi tutuluyor.

**Modeller önceden yüklenmez.** Her araç betiği, model ağırlıklarını istek zamanında diskten yükler ve istek bittiğinde bunları atar. Tam bellek profili için [Kaynak ayak izi](#resource-footprint) bölümüne bakın.

Desteklenen işlemler: arka plan kaldırma (rembg/BiRefNet), ölçeklendirme (RealESRGAN), yüz bulanıklaştırma (MediaPipe), yüz geliştirme (GFPGAN/CodeFormer), nesne silme (LaMa ONNX), OCR (PP-OCR ONNX modelleriyle Tesseract ve RapidOCR), renklendirme (DDColor), gürültü giderme, kırmızı göz giderme, fotoğraf restorasyon, vesikalık fotoğraf oluşturma, şeffaflık sabitleme (BiRefNet HR matlaştırma) ve içeriğe duyarlı yeniden boyutlandırma (Go caire ikili programı).

Python komut dosyaları `packages/ai/python/`'de bulunur. Büyük isteğe bağlı model paketleri, isteğe bağlı olarak kalıcı `/data/ai` birimine yüklenir. Doğru OCR imzalı, platforma özel yapıtlar kullanır; yerleşik Tesseract katmanı, model paketinin indirilmesini gerektirmez.

### `@snapotter/shared` {#snapotter-shared}

Hem ön uç hem de arka uç tarafından kullanılan paylaşılan TypeScript türleri, sabitler (`APP_VERSION` ve araç tanımları gibi) ve i18n çeviri dizeleri.

## Uygulamalar {#applications}

### API (`apps/api`) {#api-apps-api}

Beş modalite (image, video, audio, PDF, file) genelinde 241 araç rotası sunan bir Fastify v5 sunucusu; şunları yönetir:
- Dosya yüklemeleri, geçici çalışma alanı yönetimi ve kalıcı dosya depolama
- Versiyon zincirleriyle kullanıcı dosya kütüphanesi (`user_files` tablosu) - işlenmiş her sonuç kaynak dosyasına geri bağlanır ve hangi aracın uygulandığını kaydeder; Files sayfası için otomatik oluşturulan küçük resimlerle
- Araç yürütme (her araç isteğini görüntü motoruna veya AI köprüsüne yönlendirir)
- İşlem hattı düzenleme (birden fazla aracı sırayla zincirleme)
- BullMQ iş kuyrukları aracılığıyla eşzamanlılık denetimli toplu işleme (havuzlar: image, media, ai, docs, system)
- Kullanıcı kimlik doğrulama, RBAC (tam izin kümesiyle admin/user rolleri), API anahtarı yönetimi ve hız sınırlama
- Ekip yönetimi - yalnızca admin CRUD; kullanıcılar profillerindeki `team` alanı aracılığıyla bir ekibe atanır
- Çalışma zamanı ayarları - `settings` tablosunda, yeniden dağıtım yapmadan `disabledTools`, `enableExperimentalTools`, `loginAttemptLimit` ve diğer operasyonel düğmeleri kontrol eden bir anahtar-değer deposu
- Veritabanı destekli ayarlar aracılığıyla özel markalama ve çalışma zamanı tercihleri
- `/api/docs` adresinde Scalar/OpenAPI belgeleri
- Üretimde derlenmiş ön ucu bir SPA olarak sunma

Anahtar bağımlılıklar: Fastify, Drizzle ORM (pg-core, node-postgres), Sharp, BullMQ, ioredis, doğrulama için Zod.

Sunucu, SIGTERM/SIGINT üzerinde düzgün kapatmayı yönetir: HTTP bağlantılarını boşaltır, BullMQ işçilerini durdurur, Python dağıtıcısını kapatır ve veritabanı bağlantısını kapatır.

### Web (`apps/web`) {#web-apps-web}

Vite ile derlenmiş bir React 19 tek sayfalık uygulaması. Durum yönetimi için Zustand, stil için Tailwind CSS v4 ve simgeler için Lucide kullanır. API ile REST ve SSE (ilerleme izleme için) üzerinden iletişim kurar.

Sayfalar bir araç çalışma alanı, kalıcı yüklemeleri ve sonuçları yönetmek için bir Files sayfası, bir otomasyon/işlem hattı oluşturucu ve bir admin ayarları paneli içerir.

Derlenmiş ön uç, üretimde Fastify arka ucu tarafından sunulur, dolayısıyla Docker konteynerinde ayrı bir web sunucusu yoktur.

### Docs (`apps/docs`) {#docs-apps-docs}

Bu VitePress sitesi. `main` üzerine push edildiğinde Cloudflare Pages'e otomatik olarak dağıtılır.

## Bir isteğin akışı {#how-a-request-flows}

1. Kullanıcı web arayüzünde bir araç seçer ve bir dosya yükler.
2. Ön uç, dosya ve ayarlarla birlikte `/api/v1/tools/:section/:toolId` adresine bir multipart POST gönderir.
3. API rotası girdiyi Zod ile doğrular, ardından işlemeyi yönlendirir.
4. Standart araçlar için iş, uygun BullMQ havuzuna (modaliteye göre image, media veya docs) eklenir. İşlem içi BullMQ işçisi, görüntüyü EXIF meta verilerine göre otomatik yönlendirir, aracın işlem fonksiyonunu çalıştırır ve sonucu döndürür.
5. Çoğu yapay zeka aracı için TypeScript köprüsü, kalıcı Python dispatcher'ye bir istek gönderir. Hızlı OCR bunun yerine Tesseract'yi çağırır ve doğru OCR, sabitlenmiş yürütülebilir dosyayı aktif değişmez OCR neslinden başlatır. İstenen OCR katmanı girişte sabitlenir ve yürütme sırasında hiçbir zaman sessizce değiştirilmez.
6. İş ilerlemesi, durumun konteyner yeniden başlatmalarında hayatta kalması için PostgreSQL'deki `jobs` tablosuna kaydedilir. Gerçek zamanlı güncellemeler `/api/v1/jobs/:jobId/progress` adresinde SSE aracılığıyla iletilir.
7. API bir `jobId` ve `downloadUrl` döndürür. Kullanıcı işlenmiş dosyayı `/api/v1/download/:jobId/:filename` adresinden indirir.

İşlem hatları için API, her adımın çıktısını bir sonrakinin girdisi olarak besler ve bunları sırayla çalıştırır.

Toplu işleme için API, adım başına alt işlerle BullMQ akışlarını kullanır ve tüm işlenmiş dosyaları içeren bir ZIP dosyası döndürür.

## Kaynak ayak izi {#resource-footprint}

SnapOtter, düşük boşta bellek kullanımı için tasarlanmıştır. Başlangıçta hiçbir şey önceden yüklenmez veya sıcak tutulmaz.

### Boştayken {#at-idle}

Node.js/Fastify işlemi, PostgreSQL ve Redis çalışır durumdadır. Tipik boşta RAM, üç konteynerin tümünde (Node.js işlemi, Postgres ve Redis) **~200-300 MB**'dir. Python işlemi yok, bellekte model ağırlığı yok.

### Ne başlar ve ne zaman {#what-starts-and-when}

| Bileşen | Ne zaman başlar | Etkinken bellek |
|-----------|-------------|---------------------|
| Fastify sunucusu + Postgres + Redis | Konteyner başlangıcı | Toplam ~200-300 MB |
| BullMQ işçileri | Konteyner başlangıcı (işlem içi) | Havuz başına bir işçi (image, media, ai, docs, system) |
| Python dağıtıcısı | İlk AI araç isteği | Python yorumlayıcısı + önceden içe aktarılmış kütüphaneler (PIL, NumPy, MediaPipe, rembg) - model ağırlığı yok |
| AI model ağırlıkları | Belirli aracın isteği sırasında | Diskten yüklenir, istek bittiğinde serbest bırakılır |

### Model yükleme {#model-loading}

Tüm model ağırlığı dosyaları (toplamda birkaç GB) her zaman `/opt/models/` içinde diskte bulunur. Her AI araç betiği, yalnızca kendi model(ler)ini bir isteğin süresi boyunca belleğe yükler, ardından serbest bırakır. Bazı betikler, belleğin hemen geri döndürülmesini sağlamak için çıkarımdan sonra açıkça `del model` ve `torch.cuda.empty_cache()` çağırır.

İstekler arasında model önbelleği yoktur. Aynı AI aracını art arda çalıştırmak, modeli her seferinde yeniden yükler. Bu, her AI isteğinde bir model yükleme gecikmesi pahasına boşta belleği sıfıra yakın tutar.

### İlk AI isteği soğuk başlangıcı {#first-ai-request-cold-start}

Konteyner başladığında Python dağıtıcısı çalışmıyordur. İlk AI isteği iki şeyi paralel olarak tetikler: dağıtıcı arka planda ısınmaya başlar ve isteğin kendisi tek seferlik bir Python alt işlemi oluşturmaya geri döner. Dağıtıcı hazır sinyalini verdikten sonra, sonraki tüm AI istekleri onu doğrudan kullanır ve alt işlem oluşturma maliyetini atlar.
