---
description: "SnapOtter için güvenlik sıkılaştırma kılavuzu. Konteyner güvenliği, ağ yalıtımı, Docker secrets, Kubernetes dağıtımı ve uyumluluk yapıtları."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: c4cee5b65715
i18n_hash_version: 2
---

# Güvenlik ve Sıkılaştırma {#security-hardening}

SnapOtter dosyaları tamamen kendi altyapınızda işler. Projeyi geliştirmeye yardımcı olmak için varsayılan olarak anonim, içerik içermeyen ürün analitiği ve çökme raporları gönderir. Dosyalarınızı, dosya adlarınızı, dosya içeriklerinizi, OCR çıktısını, görsel meta verilerini veya belge metnini asla göndermez. İsteğe bağlı geri bildirim yalnızca bir kullanıcı gönderdikten sonra, yalnızca analitik etkinken gönderilir ve iletişim alanları yalnızca açık iletişim onayıyla dahil edilir. Bir yönetici, Settings > System > Privacy altında tek tıklamayla analitik ve geri bildirim yakalamayı yeniden derleme gerekmeden kapatabilir. Dosya işleme her zaman konteynerinizin içinde kalır.

Konteyner, gerekli minimum küme dışında tüm Linux yetenekleri düşürülmüş özel bir root olmayan kullanıcı (`snapotter`) olarak çalışır. Tam güvenlik açığı açıklama politikası ve güvenlik mimarisi için GitHub'daki [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) dosyasına bakın.

## Konteyner Sertleştirme {#container-hardening}

Kurallı [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) ve [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) Compose dosyaları gerçeğin kaynağıdır. Kısaltılmış bir örneği üretime kopyalamayın; dosyayı doğruladığınız sürüm etiketinden dağıtın.

Her iki yığın da aşağıdaki kontrolleri uygular:

- Bellek, takas, CPU ve PID sınırları kaçak yerel işleme içerir.
- Her hizmet tüm Linux yeteneklerini düşürür. Uygulama, birim sahipliği, tek yönlü `gosu` kimlik düşüşü ve zarif sinyal iletimi için yalnızca `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL`'yi geri ekler. PostgreSQL ve Redis yalnızca resmi giriş noktalarının ihtiyaç duyduğu alt kümeyi alır.
- `security_opt: [no-new-privileges:true]`, uygulamadaki, PostgreSQL ve Redis kapsayıcılarındaki işlemlerin ek ayrıcalıklar kazanmasını engeller. Bu, `gosu` ile uyumlu olmaya devam eder: giriş noktası kök olarak başlar, birimleri hazırlar ve yalnızca özel `snapotter` kullanıcısına düşer.
- PostgreSQL ve Redis görüntü girişleri özet ile sabitlenir. Uygulama aynı şekilde `latest` yerine doğrulanmış bir sürüm etiketine veya özete sabitlenmelidir.
- Durum denetimleri, sınırlı JSON günlük rotasyonu, dayanıklı Redis AOF ve yeniden başlatma politikası, standart dosyalarda merkezi olarak tanımlanır.

İnternet'e yönelik bir dağıtım için, 1349 numaralı bağlantı noktasını geri döngüye bağlayın ve korunan bir ters proxy'de TLS'yi sonlandırın. Benzersiz PostgreSQL ve Redis kimlik bilgileri oluşturun, sırları korumalı dosyalarda veya gizli yöneticide saklayın ve ilk yönetici şifresini hemen değiştirin.

### `read_only` Neden Ayarlanmıyor {#why-read-only-is-not-set}

PUID/PGID yeniden eşlemesi başlangıçta `/etc/passwd` ve `/etc/group`'ye yazdığı için `read_only: true` ayarlanmadı. PUID/PGID yerine Docker'ın `--user` bayrağını veya Kubernetes `runAsUser`'yi kullanırsanız salt okunur bir kök dosya sistemini güvenli bir şekilde etkinleştirebilirsiniz.

## Ağ Yalıtımı {#network-isolation}

Dosya işleme yereldir ancak varsayılan kurulum **çıkışsız bir sistem değildir**. Anonim ürün analitiği PostHog'u kullanır ve telemetri etkinleştirildiğinde kilitlenme raporlaması Sentry'yi kullanır. Her ikisini de kapatmak için `SNAPOTTER_TELEMETRY=0`'yi ayarlayın (veya Ayarlar > Sistem > Gizlilik altında analitiği devre dışı bırakın). SnapOtter hiçbir zaman yüklenen dosyaları, dosya adlarını, OCR çıktısını, belge metnini veya diğer dosya içeriklerini bu etkinliklere dahil etmez.

Diğer giden trafik ise özellik odaklıdır: AI paketi/model kurulumu, imzalı sürüm girişlerini indirir; URL içe aktarma, kullanıcı tarafından istenen genel bir URL'yi getirir; ve açıkça yapılandırılmış OIDC, SAML, OpenTelemetry, web kancaları, S3 uyumlu depolama veya benzer entegrasyonlar, yönetici tarafından seçilen hedeflerle iletişim kurar. Çalışma zamanı model indirmeleri varsayılan olarak devre dışıdır. Otomatik yedek indirmeleri açıkça etkinleştirmek için yalnızca `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` ayarını kullanın. [Çevrimdışı paket içe aktarma](/tr/guide/deployment), çalışma zamanı modeli çıkışı olmadan AI özelliklerini sağlayabilir.

**Güvenlik duvarı önerileri:**

|Senaryo|Giden kuralı|
|---|---|
|Hava boşluklu|`SNAPOTTER_TELEMETRY=0` ve `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`'yi ayarlayın, çevrimdışı AI paketi içe aktarmayı kullanın, URL içe aktarmayı ve harici entegrasyonları devre dışı bırakın, ardından çıkışı engelleyin|
|Varsayılan telemetri|Tarayıcınız/ağ günlükleriniz tarafından listelenen PostHog ve Sentry uç noktalarına izin verin; politika izin vermiyorsa telemetriyi devre dışı bırakın|
|AI paketleri gerekli|Kurulum sırasında HTTPS'nin `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`'ye izin vermesine izin verin; daha sonra bu ana bilgisayarları engelleyin|
|Harici entegrasyonlar|Yalnızca yönetici tarafından yapılandırılan OIDC/SAML/OTLP/webhook/nesne depolama hedeflerine tam olarak izin verin|

Paket arşivleri, `*.xethub.hf.co` uç noktaları üzerinden paralel olarak aktarım yapan Hugging Face'in Xet depolama alanından sunulur ve çoklu GB paket indirmelerini hızlı kılan da budur. Güvenlik duvarınız `huggingface.co`'ye izin veriyor ancak `*.xethub.hf.co`'yi engelliyorsa, yüklemeler yine de başarılı olur ancak daha yavaş tek akışlı indirmeye geri dönerse, hızlı yolda kalmak için Xet ana bilgisayarlarını izin verilenler listesine ekleyin. Tamamen çevrimdışı yüklemeler tüm bunları atlayabilir ve bunun yerine [Çevrimdışı Paket İçe Aktarma](/tr/guide/deployment) yöntemini kullanabilir.

Ters proxy yapılandırması için (Nginx, Traefik, Caddy, Cloudflare Tünelleri), [Dağıtım kılavuzuna](/tr/guide/deployment#reverse-proxy) bakın.

## Docker Secrets {#docker-secrets}

Üretim dağıtımları için, secret'ları düz metin ortam değişkenleri olarak geçirmekten kaçının. Giriş noktası Docker'ın `_FILE` kuralını destekler: bir secret'ı dosya olarak bağlayın ve karşılık gelen `_FILE` değişkenini yoluna ayarlayın.

**Desteklenen secret'lar:**

| Değişken | `_FILE` eşdeğeri |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Docker Compose secrets ile örnek:**

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD_FILE=/run/secrets/snapotter_password
      - COOKIE_SECRET_FILE=/run/secrets/cookie_secret
    secrets:
      - snapotter_password
      - cookie_secret

secrets:
  snapotter_password:
    file: ./secrets/snapotter_password.txt
  cookie_secret:
    file: ./secrets/cookie_secret.txt
```

::: tip 
Docker Compose secrets (Swarm olmadan) Compose v2.23 veya üstünü gerektirir.
:::

## Kubernetes Dağıtımı {#kubernetes-deployment}

Giriş noktası, konteynerin zaten root olmayan olarak çalıştığını algılar (ör. Kubernetes `runAsUser` aracılığıyla) ve gosu ayrıcalık düşürmesini otomatik olarak atlar. Bu durumda bağlanan birimleri kendisi chown yapamaz, bu nedenle bunların yazılabilir olduğunu doğrular ve değilse eyleme geçirilebilir yönlendirmeyle erken çıkar - `fsGroup` ve yabancı-UID kurulumları (TrueNAS, OpenShift) için [Depolama izinleri](/tr/guide/deployment#storage-permissions) bölümüne bakın.

**Önerilen Pod SecurityContext:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: snapotter
spec:
  replicas: 1
  selector:
    matchLabels:
      app: snapotter
  template:
    metadata:
      labels:
        app: snapotter
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        runAsGroup: 999
        fsGroup: 999
      containers:
        - name: snapotter
          image: snapotter/snapotter:latest
          ports:
            - containerPort: 1349
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
          resources:
            requests:
              cpu: "1"
              memory: 2Gi
            limits:
              cpu: "4"
              memory: 6Gi
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
          volumeMounts:
            - name: data
              mountPath: /data
            - name: workspace
              mountPath: /tmp/workspace
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: snapotter-data
        - name: workspace
          emptyDir:
            medium: Memory
            sizeLimit: 2Gi
```

`runAsUser: 999` pod düzeyinde ayarlandığından, giriş noktası gosu'yu tamamen atlar. Bu, `allowPrivilegeEscalation: false` ve `drop: [ALL]` yeteneklerine çakışma olmadan izin verir.

Kaynak boyutlandırma için [Donanım Gereksinimleri](/tr/guide/deployment#hardware-requirements) bölümüne bakın.

## Yedekleme ve Kurtarma {#backup-and-recovery}

Üretim Oluşturma yığını dört cilt tanımlar. PostgreSQL, Redis ve dosya durumunun zaman içinde aynı noktayı tanımlaması için, girişi durdurun ve koordineli bir yedekleme almadan önce etkin işlerin bitmesini bekleyin.

|Hacim|İçindekiler|İyileşme tedavisi|
|---|---|---|
|`SnapOtter-pgdata`|PostgreSQL kullanıcıları, ayarlar, işlem hatları, işler, dosya meta verileri ve denetim günlüğü|Kritik; taşınabilir kurtarma için hızlı bir mantıksal döküm kullanın|
|`SnapOtter-data`|Kaydedilen kitaplık nesneleri, günlükler ve AI durumu (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|Tüm birimi yedekleyin; yerden tasarruf etmek için tüm AI durumlarını kasıtlı olarak çıkarın ve paketlerini yeniden yükleyin|
|`SnapOtter-redisdata`|Dayanıklı BullMQ kuyruk durumu için Redis AOF|Uygulamayı duraklatıp `SAVE`'yi zorladıktan sonra yedekleyin; sıraya alınmış çalışmayı tam olarak sürdürmek için gerekli|
|`SnapOtter-workspace`|Geçici nesne depolama anahtarları (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|Tüm işler boşaltıldıktan veya iptal edildikten sonra yedekleme yapmayın; işler aktifken asla atmayın|

Normalde birim adlarının ön ekini proje adıyla birlikte oluşturun. `SnapOtter-data` gibi bir görünen adın Docker birim adı olduğunu varsaymak yerine, gerçek kaynak birimini takılı kapsayıcıdan çözümleyin.

### Veritabanı yedeklemesi {#database-backup}

PostgreSQL'in özel arşiv formatını kullanın ve yedeklemeyi tamamlanmış olarak değerlendirmeden önce arşivi doğrulayın:

```bash
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore only into a fresh/disposable target first; any SQL error fails the command.
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Her yedeklemeyi yalıtılmış bir yığına geri yükleyerek, veritabanı kayıtlarını ve dosya sağlama toplamlarını kontrol ederek ve uygulamayı başlatarak test edin. Deponun `tests/qa/backup-restore-drill.sh`'si, açık bir `QA_IMAGE`'ye karşı bu serbest bırakma kapısını otomatikleştirir.

Platformunuz bunun yerine kilitlenmeyle tutarlı birim anlık görüntüleri alıyorsa, önce tüm yığını durdurun ve tüm kritik birimlerin anlık görüntüsünü tek bir set olarak alın. Çalışan bir kapsayıcıdan alınan ham PostgreSQL veri dizini kopyası, desteklenen bir mantıksal yedekleme değildir.

### Dosya ve kuyruk yedeklemesi {#file-and-queue-backup}

Dosya ve kuyruk birimlerini yakalamadan önce uygulamayı duraklatın. Gerçek birim adını çözümlemek, Redis'i mevcut durumunu sürdürmeye zorlamak ve sahiplik ve izinler korunarak arşivlemek için `docker inspect` kullanın:

```bash
docker stop SnapOtter
docker exec SnapOtter-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE
docker stop SnapOtter-redis

DATA_VOLUME="$(docker inspect SnapOtter --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
REDIS_VOLUME="$(docker inspect SnapOtter-redis --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"

install -d -m 700 backup
docker run --rm -v "$DATA_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-data.tar.gz -C /source .
docker run --rm -v "$REDIS_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-redis.tar.gz -C /source .
sha256sum backup/snapotter-*.tar.gz > backup/SHA256SUMS
```

Uygulamadan önce Redis'i yeniden başlatın. `/data/ai`'yi kasıtlı olarak hariç tutarsanız, bir `installed.json` kaydını modelleri veya sanal ortamı olmadan korumak yerine tüm AI alt ağacını kaldırın. Yedekleme dosyalarını şifrelenmiş, erişim kontrollü ve SnapOtter çalıştıran ana bilgisayardan ayrı tutun.

## Uyumluluk Eserleri {#compliance-artifacts}

Her SnapOtter sürümü aşağıdaki güvenlik yapılarını içerir:

| eser | Biçim | Nerede bulunur? |
|---|---|---|
| Konu bağlamayı serbest bırak | Kanonik JSON + GitHub onayı | [GitHub Sürümü](https://github.com/snapotter-hq/SnapOtter/releases) varlığı: `snapotter-v{version}-release-subjects.json` |
| Arşiv SBOM | CycloneDX ve SPDX JSON | Varlıkları serbest bırakma: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Resim SBOM | CycloneDX ve SPDX JSON | Varlıkları serbest bırakma: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Güvenlik açığı taramaları | Trivy JSON | Eşleşen `archive-linux-{arch}` veya `image-linux-{arch}` önekleriyle varlıkları serbest bırakın |
| Güvenlik açığı taraması | SARIF | [GitHub Güvenlik](https://github.com/snapotter-hq/SnapOtter/security) sekmesi |
| Statik analiz | CodeQL (JS/TS + Python) | [GitHub Güvenlik](https://github.com/snapotter-hq/SnapOtter/security) sekmesi, haftalık + PR başına çalışır |
| Bağımlılık incelemesi | GitHub yerel | PR başına kontrol, yüksek önem derecesine sahip eklemelerde başarısız olur |
| Python bağımlılık denetimi | pip-audit | Her basışta CI çalıştırma günlüğü |
| Güvenlik politikası | Markdown | Depodaki [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| Bağımlılık güncellemeleri | Dependabot | Npm, pip, Docker, Eylemler için otomatik haftalık PR'ler |

**Kendi taramanızı çalıştırma:**

Yayın konusu bildirimini indirin ve yayın iş akışı tarafından onaylandığını doğrulayın:

```bash
gh attestation verify snapotter-v2.1.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Bildirim, `releaseTag`, `releaseCommit` ve `workflowTriggerCommit`'yi ayrı ayrı kaydeder. `releaseCommit`'nin değişmez etiketten çıkarılan kayıt olduğunu doğrulayın, ardından arşivin, görüntünün, SBOM'nin veya tükettiğiniz taramanın SHA-256 özetini `subjects`'deki girişine göre doğrulayın. Bu ayrım kasıtlıdır: yeni oluşturulan bir sürüm taahhüdünün kontrol edilmesi, iş akışının OIDC kimlik bilgisindeki taahhüt kimliğini değiştirmez.

İndirilen bir SBOM'yi veya görüntüyü doğrudan da tarayabilirsiniz:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.1.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.1.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.1.0
```

::: info
Görüntü SBOMs ve taramalar, söz konusu sürüm için yayınlanan mimariye özgü görüntüyü tam olarak yansıtır. Arşiv SBOMs ve taramalar, önceden oluşturulmuş arşivi ayrı ayrı açıklar. Dağıtımdan sonra yüklenen AI model paketleri, çalışma zamanında indirildikleri için bu SBOMs'ye dahil edilmez.
:::
