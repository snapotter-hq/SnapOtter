---
description: "Varsayılan değerleriyle tüm SnapOtter ortam değişkenleri. Kimlik doğrulamayı, depolamayı, AI modellerini, analitiği ve daha fazlasını yapılandırın."
i18n_source_hash: 8ff4e8d32091
i18n_provenance: machine
i18n_output_hash: 52e3eb4f1b46
i18n_hash_version: 2
---

# Yapılandırma {#configuration}

Tüm yapılandırma ortam değişkenleri üzerinden yapılır. Her değişkenin makul bir varsayılan değeri vardır, bu yüzden SnapOtter hiçbirini ayarlamadan da kutudan çıktığı gibi çalışır.

## Ortam değişkenleri {#environment-variables}

### Sunucu {#server}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `1349` | Sunucunun dinlediği port. |
| `HOST` | `0.0.0.0` | Sunucunun dinlediği IP adresi. Bir köprü (bridge) ağında (`docker run` ve Compose için varsayılan) `0.0.0.0` (veya `::`) değerini koruyun; aksi halde yayımlanan portlar çalışmaz hale gelir. Doğrudan (native) bir kurulumda veya ana makine ağındaki bir konteynerde `127.0.0.1`, API'yi ağın dışında tutar; uzaktan erişim için önüne bir ters vekil sunucu (reverse proxy) koyun. [Gömülü mod](#embedded-mode) yalnızca `0.0.0.0`, `::` veya `127.0.0.1` ile çalışır, çünkü başlangıç denetimi `127.0.0.1` adresini çağırır. Başka herhangi bir adresle, `::1` dahil, konteyner hiçbir zaman başlamış sayılmaz ve sonradan yaşanan bir çökme, sunucuyu yeniden başlatmak yerine konteyneri durdurur. IP adresi olmayan her değer, `localhost` dahil, sunucuyu başlangıçta durdurur. |
| `BASE_PATH` | (boş) | Genel dağıtım yolu, örn. `/snapotter`. Boş bırakılırsa veya `/` verilirse alan adının kökünden sunulur. Çalışma zamanında uygulanır; imajın yeniden derlenmesi gerekmez. |
| `RATE_LIMIT_PER_MIN` | `1000` | IP başına dakikadaki en fazla istek sayısı. Hız sınırlamasını kapatmak için 0 yapın. |
| `API_KEYS_RATE_LIMIT_PER_MIN` | `30` | API anahtarı yönetim uç noktalarına (listeleme, oluşturma, iptal) IP başına dakikadaki en fazla istek sayısı. Araç çağrılarında kullanılan anahtarlar bundan etkilenmez. Sınır olmaması için `0` yapın. |
| `CORS_ORIGIN` | (boş) | CORS için izin verilen kaynakların virgülle ayrılmış listesi. Boşsa yalnızca aynı kaynağa izin verilir. |
| `LOG_LEVEL` | `info` | Günlük ayrıntı düzeyi. Şunlardan biri: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Hangi eşlerin istemci IP'sini `X-Forwarded-For` üzerinden ayarlayabileceği. Varsayılan değer yalnızca özel ağdaki bir eşe güvenir; böylece Docker ağındaki veya LAN'daki bir ters vekil sunucu (reverse proxy) güvenilir sayılır, genel ağdaki bir istemcinin taklit ettiği başlık ise sayılmaz. `true` değerini yalnızca önünüzde, genel bir adreste kontrol ettiğiniz bir vekil sunucu varsa ayarlayın. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | (ayarlanmamış) | İlk çalıştırmadaki analitik sorusunu önceden yanıtlar, böylece kimseye sorulmaz. Ayarlanmamışsa yeni bir örnek yöneticisine sorar ve yanıt alana kadar hiçbir şey göndermez. `off` örneği "Anonim Ürün Analitiği" kapalı olarak, `on` ise açık olarak başlatır. Bu değişken ayarı yalnızca henüz kimse bir seçim yapmamışken doldurur. Ayar bir kez kaydedildikten sonra, ister bir yönetici ister bu değişken tarafından, değişkeni değiştirmenin hiçbir etkisi olmaz; bir yönetici ayarı yine de Ayarlar > Sistem > Gizlilik altından değiştirebilir. |

### Kimlik doğrulama {#authentication}

Aşağıdaki iki boolean değişken yalnızca `true` ve `false` değerlerini kabul eder. Bunun dışındaki her değer (`1`, `yes` veya `on`) doğrulamadan geçemez ve sunucu dinlemeye başlamadan çıkar.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `AUTH_ENABLED` | `true` | Oturum açmayı zorunlu kılar. Hiç hesap olmadan çalıştırmak için `false` yapın; bu durumda her isteğe yönetici hakları verilir, bu yüzden yalnızca güvenilir bir ağda kullanın. |
| `DEFAULT_USERNAME` | `admin` | İlk yönetici hesabının kullanıcı adı. Yalnızca ilk çalıştırmada kullanılır. |
| `DEFAULT_PASSWORD` | `admin` | İlk yönetici hesabının parolası. İlk oturum açmadan sonra değiştirin. |
| `MAX_USERS` | `0` (sınırsız) | Kayıtlı kullanıcı hesaplarının en fazla sayısı. Sınırsız için 0 yapın. |
| `SESSION_DURATION_HOURS` | `168` | Oturum ömrü, saat cinsinden (varsayılan 7 gündür). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | İlk oturum açmadaki zorunlu parola değiştirme istemini atlamak için `true` yapın. |
| `LOGIN_ATTEMPT_LIMIT` | `30` | IP başına dakikadaki en fazla oturum açma isteği. Dakika dolana kadar sonraki denemeler `429` alır. Tek bir kullanıcı adı için tekrarlanan başarısız denemeler genellikle önce `LOGIN_THROTTLE_MAX_FAILURES` sınırına takılır. Bir yönetici bunu Settings > System altında değiştirebilir. Sınır olmaması için `0` yapın. Kaynaktan derlemede değer 10 ile başlar. |
| `LOGIN_THROTTLE_MAX_FAILURES` | `10` | Bir kullanıcı adının `LOGIN_THROTTLE_WINDOW_S` süresi içinde yapabileceği başarısız parola ile oturum açma sayısı; bu sayıdan sonra, hangi IP'den gelirse gelsin, o kullanıcı adı için yapılan denemeler `429` alır. En eski başarısız denemeler pencereden çıktıkça tekrar izin verilir. Kısıtlamayı kapatmak için 0 yapın. |
| `LOGIN_THROTTLE_WINDOW_S` | `900` | Bu pencerenin uzunluğu, saniye cinsinden. En az 1 olmalıdır; sunucu 0 değeriyle başlamayı reddeder. |

### Depolama {#storage}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` veya `s3`. S3 ve MinIO, s3_storage özelliğini içeren bir lisansın yanı sıra aşağıdaki `S3_*` değişkenlerini gerektirir. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL bağlantı dizesi ve her isteğin sunulduğu bağlantı. 2.3.0 ve sonrasında `DATABASE_MIGRATION_URL` değerini de ayarlayın; bu durumda bu bağlantı, uygulamanın tabloları üzerinde yalnızca DML yetkisine sahip olan en düşük yetkili çalışma zamanı rolü olur. Compose yığını bunu `postgres` servisine yönlendirir; gömülü modu kullanmak için bunu (`REDIS_URL` ile birlikte) ayarlamadan bırakın. Bir unix soketi üzerinden bağlanmak için soket dizinini `host` içinde, `postgres://user:pass@localhost/snapotter?host=/var/run/postgresql` örneğindeki gibi belirtin ve o dizini konteynere bağlayın. |
| `DATABASE_MIGRATION_URL` | (boş) | Yalnızca açılış sırasında, migrasyonları çalıştırmak ve çalışma zamanı rolüne yetki vermek için kullanılan, ilk istekten önce kapatılan yetkili bağlantı. Boş bırakırsanız SnapOtter tek rolle çalışır ve her iki işi de `DATABASE_URL` yapar. Bkz. [En düşük yetkili roller](/tr/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Redis bağlantı dizesi (BullMQ iş kuyrukları için kullanılır). Compose bunu `redis` servisine yönlendirir. Bir unix soketi için `unix:///run/redis/redis.sock?db=5` kullanın (Redis parola istiyorsa `&password=...` ekleyin) ve soketi konteynere bağlayın. |
| `WORKSPACE_PATH` | `./tmp/workspace` | İşleme sırasında geçici dosyalar için dizin. Otomatik olarak temizlenir. İmaj `/tmp/workspace` değerini ayarlar. |
| `FILES_STORAGE_PATH` | `./data/files` | Kalıcı kullanıcı dosyaları (yüklenen görseller, kaydedilen sonuçlar) için dizin. İmaj `/data/files` değerini ayarlar. |
| `MAX_STORAGE_PER_USER_MB` | `5000` | Her kullanıcının Dosyalar kitaplığında tutabileceği veri miktarı sınırı, megabayt cinsinden. Sınırı aşacak bir kayıt, kullanılan miktar ve sınırla birlikte reddedilir. Kullanıcıya tanımlanan bir kota bu değerin yerine geçer. Sınırsız için 0 yapın. |

### S3 nesne depolama {#s3-object-storage}

Yalnızca `STORAGE_MODE=s3` olduğunda okunur. Zorunlu üç değişkenden biri eksikse başlatma, atladığınız değişkenin adıyla birlikte başarısız olur.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `S3_BUCKET` | (boş) | Yüklemeleri ve çıktıları tutan bucket. Zorunlu. |
| `S3_ACCESS_KEY_ID` | (boş) | Erişim anahtarı. Zorunlu. Konteynerde bunun yerine `S3_ACCESS_KEY_ID_FILE` üzerinden bağlayabilirsiniz. |
| `S3_SECRET_ACCESS_KEY` | (boş) | Gizli anahtar. Zorunlu. Aynı dosya kuralı geçerlidir: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Bucket bölgesi. |
| `S3_ENDPOINT` | (boş) | MinIO, R2, Backblaze ve diğer S3 uyumlu depolar için özel uç nokta. Boşsa AWS kullanılır. |
| `S3_FORCE_PATH_STYLE` | `false` | `true` yapın; MinIO ve sanal ana makine adresleme yerine `endpoint/bucket/key` isteyen her şey için geçerlidir. |
| `S3_PREFIX` | (boş) | Anahtar öneki; böylece tek bir bucket birden fazla örneği barındırabilir. |

### Hareketsiz durumda şifreleme {#encryption-at-rest}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (boş) | 64 onaltılık karakter (32 bayt). Veritabanında saklanan hassas ayarları şifreler. 64 onaltılık karakter olmayan her değer başlatmada reddedilir. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (boş) | Terk ettiğiniz anahtar, aynı biçimde. Mevcut satırların şifresi çözülebilsin diye rotasyon sırasında ikisini de ayarlayın, ardından bunu kaldırın. |

### Gömülü mod {#embedded-mode}

İmajı `DATABASE_URL` ve `REDIS_URL` olmadan çalıştırırsanız imaj, konteynerin içinde kendi PostgreSQL 17 ve Redis'ini başlatır; ikisi de loopback'e bağlıdır ve tüm veriler `/data` biriminde durur. Bu, hızlı başlangıç, homelab ve 1.x'ten yükseltmeler için tek komutluk `docker run` deneyimini geri getirir. Bu bir kolaylık yoludur, üretim dağıtımı değildir: üretimde ayrı PostgreSQL ve Redis içeren 3 konteynerli Compose yığınını çalıştırın. Gömülü mod konteynerin root olarak çalışmasını gerektirir ve keyfi UID kullanan çalışma zamanlarıyla (OpenShift, Kubernetes `runAsNonRoot`) uyumsuzdur; orada Compose kullanın.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `EMBEDDED` | `auto` | `DATABASE_URL` ve `REDIS_URL` ikisi de ayarlı değilse otomatik olarak etkinleşir. Kapatmak için `0` yapın (bu durumda harici bir `DATABASE_URL`/`REDIS_URL` ayarlı değilse uygulama, konteyner içinde sessizce bir veritabanı başlatmak yerine hemen hata verir). |
| `REDIS_MAXMEMORY` | `512mb` | Gömülü Redis için bellek sınırı (yalnızca gömülü mod). Raspberry Pi gibi belleği kısıtlı ana makinelerde düşürün. |
| `EMBEDDED_PG_PORT` | `5432` | Gömülü PostgreSQL için loopback portu (yalnızca gömülü mod). Bunu yalnızca konteyner, 5432 portunun dolu olduğu bir ağı paylaşıyorsa değiştirin; örneğin `--network host`. `EMBEDDED_REDIS_PORT` değerinden farklı ve 1023'ten büyük olmalıdır, çünkü PostgreSQL, ana makine ağında ayrıcalıklı bir porta bağlanamayan ayrıcalıksız bir kullanıcı olarak çalışır. |
| `EMBEDDED_REDIS_PORT` | `6379` | Gömülü Redis için aynısı; o da ayrıcalıksız bir kullanıcı olarak çalışır. |
| `EMBEDDED_DB_PASSWORDS` | (boş) | Bir sonraki açılışta gömülü PostgreSQL rolleri ve Redis için rastgele parolalar oluşturmak üzere `1` yapın; parolalar `/data/.embedded-db-secrets` içinde saklanır. Bundan sonra TCP üzerinden oturum açmak için bu parolalar gerekir. İlk kez 2.3.0 veya sonraki bir sürümle oluşturulmuş bir birimde PostgreSQL süper kullanıcısı TCP üzerinden hiç oturum açamaz; daha eski bir birimde veritabanı sahibi süper kullanıcıdır ve onu koruyan şey parolasıdır. Konteynerin ağını başka programlar da paylaşıyorsa, örneğin `--network host` ile, her zaman kullanın. Bu ayar o birim için açık kalır: bu değişkeni kaldırsanız bile parolalar her açılışta kullanılır; `/data/.embedded-db-secrets` dizinini silmek ise size yalnızca yeni parolalar kazandırır ya da değişken ayarlı değilse başarısız olan bir açılışa yol açar. Konteyner bu dosyalardan biri bozuk olduğu için başlamıyorsa, o dosyayı `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` ile silin ve konteyneri yeniden başlatın; bir sonraki açılış yenisini oluşturur. Değişken `1`, `0` veya boş değer alır; başka herhangi bir değer açılışı durdurur. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Açılışın, vazgeçmeden önce gömülü Redis'in `PING` yanıtını vermesini beklediği saniye sayısı. Zaman aşımında konteyner takılıp kalmak yerine durur ve nedenini günlüğe yazar. 1 ile 999999 arasında tam saniye; sınırsız değer yoktur, çünkü sonsuza kadar beklemek bu sınırın önlemek için var olduğu hatanın ta kendisidir. Yalnızca yavaş bir ana makine bu sınıra takılıyorsa artırın. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Gömülü PostgreSQL için aynısı. Süre, ilk açılıştaki `initdb` bittikten sonra başlar; bu nedenle ilk veritabanı oluşturmayı değil, sunucu başlatmayı ve çökme kurtarmayı kapsar. |

1.x'ten yükseltme: eski `snapotter.db` dosyanızı birimde `/data/snapotter.db` konumuna koyun; gömülü mod, ilk açılışta onu gömülü PostgreSQL'e aktarır. İçe aktarma bir kez çalışır; sonraki açılışlar onu atlar.

Telemetri notu: gömülü mod, diğer tüm yapılandırmalar gibi imajın analitik varsayılanını devralır. Yayımlanan imaj analitik gönderebilir, ancak yeni bir örnek önce yöneticisine sorar ve yanıt alana kadar hiçbir şey göndermez. Kapatmak için hayır yanıtını verin, `--build-arg SNAPOTTER_ANALYTICS=off` ile derleyin, ilk açılıştan önce `SNAPOTTER_ANALYTICS_DEFAULT=off` ayarlayın veya uygulama içi yönetici devre dışı bırakma seçeneğini kullanın.

### İşleme sınırları {#processing-limits}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (sınırsız) | Yükleme başına en büyük dosya boyutu, megabayt cinsinden. Sınırsız için 0 yapın. Yayımlanan imaj `0` ile gelir; kaynaktan derlemede değer 100 ile başlar. |
| `MAX_BATCH_SIZE` | `0` (sınırsız) | Tek bir toplu istekteki en fazla dosya sayısı. Sınırsız için 0 yapın. Yayımlanan imaj `0` ile gelir; kaynaktan derlemede değer 100 ile başlar. |
| `CONCURRENT_JOBS` | `0` (otomatik) | Paralel çalışan toplu iş sayısı. Kullanılabilir CPU çekirdeklerine göre otomatik algılamak için 0 yapın. |
| `MAX_MEGAPIXELS` | `0` (uygulama sınırı yok) | İzin verilen en yüksek görsel çözünürlük, megapiksel cinsinden. SnapOtter'ın kendi sınırını kaldırmak için 0 yapın. Görsel kod çözücü yine de yaklaşık 268 MP (16383 x 16383 piksel) üzerindeki her şeyi reddeder; bu yüzden 268'in üzerinde bir değerin ek bir etkisi olmaz. |
| `MAX_CPU_UPSCALE_MP` | `4` | GPU'su olmayan bir ana makinede yapay zekâ ile büyütmenin kabul ettiği en büyük girdi, megapiksel cinsinden. Büyütülmüş çıktı da bu değerin 16 katıyla sınırlanır (varsayılan olarak 64 MP); bu yüzden yüksek bir ölçek çarpanı girdi sınırını daha da düşürür. Daha büyük bir görsel, büyütmeden önce sığacak şekilde küçültülür; bu işlem sonucu özgün görselden büyük yapmayacaksa istek bunun yerine reddedilir. Lanczos girdi sınırını atlar ama çıktı sınırını atlamaz. Sınırsız için 0 yapın; bu çok fazla RAM gerektirir: RealESRGAN içeride her zaman 4x bir tampon oluşturur. |
| `MAX_WORKSPACE_SIZE_GB` | `0` (sınırsız) | Çalışma alanındaki yüklemelerin ve saklanan sonuçların toplam boyutu için sınır, GB cinsinden. Sınır aşıldığında, dosyalar `FILE_MAX_AGE_HOURS` sonunda silinene kadar yüklemeler ve araç istekleri 503 alır. Sınırsız için 0 yapın; yerel depolama, diskte 0,5 GB'tan az boş alan kaldığında yine de yazmaları 503 ile reddeder. Yayımlanan imaj `0` ile gelir; kaynaktan derlemede değer 10 ile başlar. |
| `MAX_WORKER_THREADS` | `0` (otomatik) | Görsel işleme için en fazla worker thread sayısı. Kullanılabilir CPU çekirdeklerine göre otomatik algılamak için 0 yapın. |
| `PROCESSING_TIMEOUT_S` | `0` (sınır yok) | AI araçlarını çalıştıran Python sidecar'a yapılan her çağrı için zaman aşımı, saniye cinsinden. Sınır olmaması için 0 yapın. Görsel, PDF veya medya işlerini sınırlamaz; bunu `JOB_TIMEOUT_FAST_S` ve `JOB_TIMEOUT_LONG_S` yapar. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Python AI sidecar'ının ve doğru OCR çalışma zamanının, kapanıp belleklerini serbest bırakmadan önce boşta bekledikleri saniye sayısı (ısındıktan sonra yaklaşık 1,3 GB ve 0,7 GB). İkisi de bir sonraki istekte yeniden başlar; bu yüzden boşta kapanmanın ardından yapılan ilk AI çağrısı, birkaç saniyelik kitaplık başlatma maliyetini öder. Çalışır durumda tutmak için 0 yapın. Varsayılan değer `AI_SESSION_IDLE_TIMEOUT` ile aynıdır; böylece yüklenen modeller o ayarın belirttiğinden daha erken bırakılmaz. `AI_SESSION_IDLE_TIMEOUT` değerini artırırsanız bunu da aynı değere artırın. |
| `AI_SESSION_IDLE_TIMEOUT` | `0` (otomatik) | Yüklenmiş bir yapay zekâ modelinin son kullanımından sonra sidecar'da önbellekte kalacağı süre, saniye cinsinden. Otomatik değer 600'dür. Python sidecar tarafından okunur; sidecar, `AI_SIDECAR_IDLE_TIMEOUT` sonunda kapandığında önbelleğe alınmış tüm modelleri de bırakır. |
| `AI_SESSION_CACHE_BYTES` | `0` (otomatik) | Önbelleğe alınan yapay zekâ modelleri için bellek bütçesi, bayt cinsinden. Otomatik değer GPU belleğinin %40'ıdır; yalnızca CPU kullanan bir ana makinede hiç önbellekleme yapılmaz. Modelleri RAM'de önbelleğe almak için bunu bir CPU ana makinesinde ayarlayın; bir GPU ana makinesinde önbelleklemeyi kapatmak için 1 yapın. Python sidecar tarafından okunur. |
| `MAX_AI_JOBS_PER_USER` | `5` | Bir kullanıcının aynı anda kuyrukta veya çalışır durumda tutabileceği tek dosyalık yapay zekâ işi sayısı. Fazlası, biri bitene kadar `429` alır. Yapay zekâ havuzu aynı anda tek iş çalıştırır; bu sınır, tek bir kullanıcının havuzu elinde tutmasını engeller. Toplu ve işlem hattı (pipeline) yapay zekâ çalıştırmaları sayılmaz. Sınırsız için 0 yapın. |
| `JOB_TIMEOUT_FAST_S` | `120` | Hızlı havuzlardaki (görsel ve belge araçları) tek bir iş için süre sınırı, saniye cinsinden. Daha uzun süren bir iş zaman aşımı hatasıyla başarısız olur. Sınır olmaması için 0 yapın. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Uzun havuzlardaki (AI ve medya araçları ile uzun süreli olarak işaretlenmiş her araç) tek bir iş için süre sınırı, saniye cinsinden. Sınır olmaması için 0 yapın. Dengeli ve En İyi PDF OCR kendi süre sınırlarını sayfa sayısına göre (sayfa başına 2 ve 5 dakika) en fazla 6 saate kadar uzatır; bu yüzden büyük bir PDF için bunu artırmanız gerekmez. |
| `SYNC_WAIT_MS` | `8000` | Bir araç isteğinin, API beklemeyi bırakıp SSE üzerinden takip edilecek bir iş kimliğiyle `202` döndürmeden önce işini ne kadar beklediği, milisaniye cinsinden. İşi durdurmaz. İş ne kadar sürerse sürsün beklemek için 0 yapın. |
| `MAX_PIPELINE_STEPS` | `20` | Bir pipeline'daki en fazla adım sayısı. Sınır olmaması için 0 yapın. |
| `MAX_PIPELINE_STEP_PIXELS` | `67108864` | Bir işlem hattı adımının isteyebileceği en büyük çıktı, piksel cinsinden genişlik çarpı yükseklik olarak (varsayılan 8192 x 8192'dir). Ayarları bundan fazlasını isteyen bir adım, işlem hattı çalışmadan önce reddedilir. Sınır olmaması için 0 yapın. |
| `MAX_CANVAS_PIXELS` | `0` (sınır yok) | Çıktı görselleri için piksel cinsinden en büyük tuval boyutu. Sınır olmaması için 0 yapın. |
| `MAX_SVG_SIZE_MB` | `50` | Temizlemeden önce kabul edilen en büyük SVG, megabayt cinsinden. `0` burada çevresindeki satırlardan farklı davranır. Ön ayrıştırma boyut sınırını yükseltmek yerine tamamen kaldırır, bu yüzden bunu ayarlı bırakın. |
| `MAX_PDF_PAGES` | `0` (sınırsız) | PDF'den görsele dönüştürmede en fazla PDF sayfa sayısı. Sınırsız için 0 yapın. |
| `MAX_VIDEO_DURATION_S` | `0` (sınırsız) | Video araçlarının kabul ettiği en uzun video, saniye cinsinden. Daha uzun dosyalar işlenmeden önce reddedilir; hatada süre ve sınır belirtilir. Sınırsız için 0 yapın. |
| `MAX_AUDIO_DURATION_S` | `0` (sınırsız) | Aynısı, ses araçları için. |
| `MAX_VIDEO_BITRATE_KBPS` | `0` (sınırsız) | Video araçlarının kabul ettiği en yüksek toplam bit hızı, saniyedeki kilobit cinsinden. Sınırsız için 0 yapın. |
| `PREVIEW_TIMEOUT_S` | `300` | Bir video veya ses dosyasının tarayıcı içi önizleme klibini kodlamak için zaman sınırı, saniye cinsinden. Belge önizlemeleri bunun yerine `LIBREOFFICE_TIMEOUT_S` kullanır. Sınır olmaması için 0 yapın. |
| `LIBREOFFICE_TIMEOUT_S` | `120` | Tek bir LibreOffice dönüştürmesi için zaman sınırı (Word, Excel ve PowerPoint'ten PDF'ye, belge dönüştürücüleri ve belge önizlemeleri), saniye cinsinden. Sınır olmaması için `0` yapın. |
| `GIF_BG_MAX_FRAMES` | `150` | GIF Arka Planını Kaldır aracının tek bir animasyonda kabul ettiği en fazla kare sayısı. Daha uzun animasyonlar, kare sayısını belirten bir `400` alır. Kare sınırı olmaması için 0 yapın; ayrı bir piksel bütçesi yine de geçerlidir. |
| `SUBPROCESS_MEMORY_LIMIT_MB` | `0` (kapalı) | Şu yardımcı işlemlerin her biri için adres alanı sınırı, megabayt cinsinden: medya ve belge motorlarındaki ffmpeg, ffprobe, Ghostscript, qpdf, LibreOffice, pandoc ve pdfcpu; ayrıca görseller için exiftool, HEIF, JPEG XL ve JPEG 2000 kod çözücüleri ve kodlayıcıları, RAW kod çözücüsü ve ffmpeg yedek kod çözücüsü. ImageMagick'in kendi bellek sınırları olduğu için sınırlanmaz; yapay zekâ sidecar'ı da sınırlanmaz. Sınırı aşan bir işlem, tüm konteyneri bellek yetersizliği (OOM) sonlandırıcısına sürüklemek yerine sonlandırılır. Bu, fiziksel belleği değil sanal belleği sınırlar; bu yüzden bir işlemin gerçekte kullandığının epey üzerinde bir değer verin. En çok belleği JPEG XL kodlayıcı ister: 24 MP'lik bir görsel yaklaşık 1,8 GB gerektirdi ve 1 GB'ta başarısız oldu; daha fazla iş parçacığı veya CPU bunu pek değiştirmez. Sınır ayarlıyken HEIF kodlayıcı iki worker thread ile sınırlanır; bu, 24 MP'lik bir kodlamayı daha yavaş kodlama pahasına yaklaşık 0,8 GB'a indirir. `2048` ile başlayın ve yalnızca en büyük dosyalarınızı test ettikten sonra düşürün. Kapatmak ve konteyner bellek sınırına güvenmek için 0 yapın. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Bir araç isteğinin taşıyabileceği en büyük `settings` alanı, kilobayt cinsinden ve UTF-8 bayt olarak sayılır. Sınırı aşan istekler `400` alır. Sınır olmaması için 0 yapın. Gerçek araç ayarları 64 KB'tan çok daha küçüktür; bu yüzden bunu yalnızca bir istemci alışılmadık derecede büyük ayarlar gönderiyorsa artırın. |
| `MAX_SUBTITLE_SIZE_MB` | `1` | Altyazı Yak ve Altyazı Göm araçlarının kabul ettiği en büyük altyazı dosyası (`.srt`, `.vtt`, `.ass`), megabayt cinsinden. Daha büyük dosyalar, dosya boyutunu ve sınırı belirten bir `400` alır. Sınır olmaması için 0 yapın. Uzun metrajlı bir film altyazı dosyası genellikle 1 MB'ın çok altındadır. |
| `MAX_METADATA_TAG_LENGTH` | `10000` | Meta Verileri Düzenle aracının tek bir etikete (sanatçı, açıklama, anahtar sözcükler vb.) yazdığı en uzun değer, karakter cinsinden. Daha uzun değerler, etiketi ve sınırı belirten bir `400` alır. Sınır olmaması için 0 yapın. Uzun başlıklar veya açıklamalar saklıyorsanız artırın. Bir etiket değerinin ayrıca `MAX_SETTINGS_PAYLOAD_KB` ve işletim sisteminin argüman başına sınırı (Linux'ta 128 KB) içine sığması gerekir. |

### Motorlar {#engines}

SnapOtter her işleme ikili dosyasını konteyner içinde `$PATH` üzerinde arar; bu yüzden kendi derlemenizi bağlamadığınız sürece bunlar boş kalır.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `FFMPEG_PATH` | (boş) | Video ve ses araçlarının arkasındaki `ffmpeg` ikili dosyasının yolu. |
| `FFPROBE_PATH` | (boş) | Medya dosyalarını işlenmeden önce okuyan `ffprobe` yolu. `FFMPEG_PATH` ile aynı derlemeye yönlendirin. |
| `QPDF_PATH` | (boş) | PDF araçları tarafından ve yüklenen PDF'leri denetlemek için kullanılan `qpdf` yolu. |
| `SOFFICE_PATH` | (boş) | Ofis belgesi dönüştürmeleri için kullanılan LibreOffice'in `soffice` yolu. |
| `PDFCPU_PATH` | (boş) | Bazı PDF araçlarının kullandığı `pdfcpu` yolu. |
| `GS_PATH` | (boş) | PDF araçları ve PDF OCR tarafından kullanılan Ghostscript'in `gs` yolu. |
| `PANDOC_PATH` | (boş) | Belge dönüştürmelerinin kullandığı `pandoc` yolu. |
| `SNAPOTTER_FONT_FILE` | (boş) | Videonun üzerine çizilen metin için yazı tipi dosyası (altyazı yakma, video filigranı). Boşsa imajın bulduğu ilk yazı tipi kullanılır. |
| `SNAPOTTER_FONT_FAMILY` | (boş) | `SNAPOTTER_FONT_FILE` dosyasının yazı tipi ailesi adı. Boş, `Sans` anlamına gelir. |
| `SNAPOTTER_HW_ACCEL` | (boş) | Donanım video kodlayıcı ailesi, `nvenc` veya `vaapi`. Boşsa yazılımla kodlar. |

`SNAPOTTER_HW_ACCEL` için o kodlayıcı ailesiyle derlenmiş bir ffmpeg gerekir ve imajdaki ffmpeg ikisine de sahip değildir. İmajın kendi ikili dosyasıyla bu ayar yazılımla kodlamaya geri döner ve bunu açılış günlüğünde belirtir. Kullanmak için kendi ffmpeg derlemenizi bağlayın, `FFMPEG_PATH` ve `FFPROBE_PATH` değişkenlerini ona yönlendirin ve konteynere GPU aygıtını verin. `nvenc` için ayrıca `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video` değerini de ayarlayın: imaj yalnızca `compute,utility` ister ve `video` olmadan NVIDIA çalışma zamanı kodlama kitaplığını bağlamaz; bu durumda kodlayıcı listelenir ama her kodlama başarısız olur. Var olmayan veya çalıştırılabilir olmayan bir yol geçersiz kılması da açılış günlüğünde adıyla belirtilir ve o ikili dosyayı gerektiren her iş, yolu düzeltene veya ayarı kaldırana kadar başarısız olur.

Yayımlanan Compose dosyaları bunların hepsini `.env` dosyasından aktarır, bu yüzden orada ayarlamak yeterlidir.

### Temizlik {#cleanup}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Kaydedilmemiş işleme sonuçlarının (ham yüklemeler ve araç çıktıları) otomatik silinmeden önce ne kadar süre tutulacağı. Dosyalar kitaplığına açıkça kaydettiğiniz dosyalar etkilenmez ve siz silene kadar kalır. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Temizlik işinin ne sıklıkta çalıştığı. |
| `JOBS_RETENTION_DAYS` | `30` | Tamamlanmış bir iş kaydının (tamamlanan, başarısız olan veya iptal edilen) her 6 saatte bir çalışan saklama taraması onu silmeden önce tutulduğu gün sayısı. Bir yönetici bunu Settings > System altında değiştirebilir. Yasal tutma altındaki kullanıcılar ve ekipler kayıtlarını korur. Sonsuza kadar saklamak için 0 yapın. |
| `AUDIT_RETENTION_DAYS` | `0` (süresiz) | Denetim günlüğü girdilerinin tutulduğu gün sayısı. Aynı değiştirme ve yasal tutma kuralları geçerlidir. Kurcalamaya dayanıklı denetim günlüğü açıkken hiçbir şey silinmez. Sonsuza kadar saklamak için 0 yapın. |

### Kurumsal lisans {#enterprise-license}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `SNAPOTTER_LICENSE_KEY` | (boş) | SAML, SCIM ve S3 depolama gibi kurumsal özelliklerin kilidini açan lisans anahtarı. Başlangıçta okunur, bu yüzden değiştirdikten sonra yeniden başlatın. Geçersiz veya süresi dolmuş bir anahtar uyarı günlüğüne yazılır ve sunucu bu özellikler olmadan çalışır. Konteynerde bunun yerine `SNAPOTTER_LICENSE_KEY_FILE` ile bağlayabilirsiniz ([Docker secrets](/tr/guide/security#docker-secrets) bölümüne bakın). |

### Görünüm {#appearance}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `DEFAULT_THEME` | `light` | Yeni oturumlar için varsayılan tema. `light`, `dark` veya `system`. |
| `DEFAULT_LOCALE` | `en` | Varsayılan arayüz dili. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Varsayılan araç düzeni. `sidebar` veya `fullscreen`. |

### Docker izinleri {#docker-permissions}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PUID` | `999` | Konteyner işlemini bu UID ile çalıştırır. Bind mount'lar için ana makinedeki kullanıcınızla eşleşecek şekilde ayarlayın (`id -u`). Yazılabilir bir kök dosya sistemi gerekir; [güvenlik rehberine](/tr/guide/security#why-read-only-is-not-set) bakın. |
| `PGID` | `999` | Konteyner işlemini bu GID ile çalıştırır. Bind mount'lar için ana makinedeki grubunuzla eşleşecek şekilde ayarlayın (`id -g`). Yazılabilir bir kök dosya sistemi gerekir; [güvenlik rehberine](/tr/guide/security#why-read-only-is-not-set) bakın. |

## Docker örneği {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Birimler {#volumes}

Docker Compose yığını dört birim kullanır:

- `/data` (uygulama): AI modelleri, Python venv ve kullanıcı dosyaları. Yüklenen dosyaları ve kurulu AI paketlerini yeniden başlatmalar arasında korumak için bunu bağlayın.
- `/tmp/workspace` (uygulama): İşlenen dosyalar için geçici depolama. Bu geçici olabilir, ancak bağlamak konteynerin yazılabilir katmanının dolmasını önler.
- `SnapOtter-pgdata` (postgres): PostgreSQL veri dizini. Tüm ilişkisel verileri (kullanıcılar, ayarlar, pipeline'lar, işler, denetim günlüğü) tutar. `pg_dump` ile veya birim anlık görüntüsüyle yedekleyin.
- `SnapOtter-redisdata` (redis): Dayanıklı iş kuyrukları için Redis append-only dosyası.
