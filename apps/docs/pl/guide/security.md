---
description: "Przewodnik po wzmacnianiu bezpieczeństwa SnapOtter. Bezpieczeństwo kontenerów, izolacja sieci, sekrety Docker, wdrożenie Kubernetes i artefakty zgodności."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: 20c36e0b6bb9
i18n_hash_version: 2
---

# Bezpieczeństwo i wzmacnianie {#security-hardening}

SnapOtter przetwarza pliki w całości na twojej infrastrukturze. Domyślnie wysyła anonimową, pozbawioną treści analitykę produktu i raporty o awariach, aby pomóc ulepszać projekt. Nigdy nie wysyła twoich plików, nazw plików, zawartości plików, wyniku OCR, metadanych obrazów ani tekstu dokumentów. Opcjonalna informacja zwrotna jest wysyłana dopiero po jej przesłaniu przez użytkownika, tylko gdy analityka jest włączona, a pola kontaktowe są dołączane wyłącznie za wyraźną zgodą na kontakt. Administrator może wyłączyć analitykę i zbieranie informacji zwrotnej jednym kliknięciem w Ustawienia > System > Prywatność, bez konieczności przebudowy. Przetwarzanie plików zawsze pozostaje wewnątrz twojego kontenera.

Kontener działa jako dedykowany użytkownik nie-root (`snapotter`) z odrzuconymi wszystkimi uprawnieniami Linuksa poza minimalnym wymaganym zestawem. Po pełną politykę ujawniania podatności i architekturę bezpieczeństwa zobacz [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) na GitHub.

## Hartowanie kontenera {#container-hardening}

Źródłem prawdy są kanoniczne pliki [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) i [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml). Nie kopiuj skróconego przykładu do produkcji; wdróż plik ze zweryfikowanego tagu wydania.

Obydwa stosy stosują następujące elementy sterujące:

- Limity pamięci, wymiany, procesora i PID powodują niekontrolowane przetwarzanie natywne.
- Każda usługa powoduje utratę wszystkich możliwości Linuksa. Aplikacja dodaje tylko `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` dla własności wolumenu, jednokierunkową utratę tożsamości `gosu` i płynne przekazywanie sygnału. PostgreSQL i Redis otrzymują tylko podzbiór potrzebny ich oficjalnym punktom wejścia.
- `security_opt: [no-new-privileges:true]` uniemożliwia procesom w aplikacji, kontenerach PostgreSQL i Redis uzyskanie dodatkowych uprawnień. Pozostaje to zgodne z `gosu`: punkt wejścia zaczyna się jako root, przygotowuje woluminy i przechodzi tylko do dedykowanego użytkownika `snapotter`.
- Wejścia obrazów PostgreSQL i Redis są przypinane za pomocą skrótu. Aplikację należy również przypiąć do zweryfikowanego tagu wydania lub podsumowania, a nie `latest`.

— Kontrole stanu, ograniczona rotacja dzienników JSON, trwała funkcja Redis AOF i zasady ponownego uruchamiania są definiowane centralnie w plikach kanonicznych.

W przypadku wdrożenia z dostępem do Internetu powiąż port 1349 z pętlą zwrotną i zakończ protokół TLS na utrzymywanym zwrotnym serwerze proxy. Wygeneruj unikalne dane uwierzytelniające PostgreSQL i Redis, przechowuj sekrety w chronionych plikach lub menedżerze sekretów i natychmiast zmień początkowe hasło administratora.

### Dlaczego `read_only` nie jest ustawione {#why-read-only-is-not-set}

`read_only: true` nie jest ustawiony, ponieważ ponowne mapowanie PUID/PGID zapisuje podczas uruchamiania `/etc/passwd` i `/etc/group`. Jeśli zamiast PUID/PGID użyjesz flagi `--user` Dockera lub Kubernetes `runAsUser`, możesz bezpiecznie włączyć główny system plików tylko do odczytu.

## Izolacja sieci {#network-isolation}

Przetwarzanie plików odbywa się lokalnie, ale instalacja domyślna **nie jest systemem bez ruchu wychodzącego**. Anonimowe analizy produktów korzystają z PostHog, a raportowanie o awariach korzysta z Sentry, gdy włączona jest telemetria. Ustaw `SNAPOTTER_TELEMETRY=0` (lub wyłącz analizę w obszarze Ustawienia > System > Prywatność), aby wyłączyć oba. SnapOtter nigdy nie uwzględnia w tych zdarzeniach przesłanych plików, nazw plików, danych wyjściowych OCR, tekstu dokumentu ani innej zawartości plików.

Pozostały ruch wychodzący jest oparty na funkcjach: instalacja pakietu/modelu AI powoduje pobranie podpisanych danych wejściowych wersji; Import adresu URL powoduje pobranie publicznego adresu URL żądanego przez użytkownika; i jawnie skonfigurowane OIDC, SAML, OpenTelemetry, webhooki, pamięć zgodna z S3 lub podobne integracje łączą się z miejscami docelowymi wybranymi przez administratora. Pobieranie modeli w czasie wykonywania jest domyślnie wyłączone. Ustaw `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` tylko po to, aby jawnie włączyć automatyczne pobieranie zastępcze. [Import pakietu offline](/pl/guide/deployment) może zapewnić funkcje AI bez konieczności wychodzenia z modelu środowiska wykonawczego.

**Zalecenia dotyczące zapory sieciowej:**

|Scenariusz|Reguła wychodząca|
|---|---|
|Szczelina powietrzna|Ustaw `SNAPOTTER_TELEMETRY=0` i `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, użyj importu pakietów AI offline, wyłącz import adresów URL i integracje zewnętrzne, a następnie zablokuj wyjście|
|Domyślna telemetria|Zezwól na punkty końcowe PostHog i Sentry wymienione w dziennikach przeglądarki/sieci; wyłącz telemetrię, jeśli zasady na to nie pozwalają|
|Potrzebne pakiety AI|Podczas instalacji zezwól HTTPS na `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; następnie zablokuj te hosty|
|Integracje zewnętrzne|Zezwalaj tylko na dokładnie skonfigurowane przez administratora miejsca docelowe OIDC/SAML/OTLP/webhook/object-storage|

Archiwa pakietów są obsługiwane z pamięci Xet firmy Hugging Face, która jest przesyłana równolegle przez punkty końcowe `*.xethub.hf.co` i dzięki temu pobieranie pakietów o wielkości wielu GB jest szybkie. Jeśli twoja zapora sieciowa pozwala na `huggingface.co`, ale blokuje `*.xethub.hf.co`, instalacje nadal się powiodą, ale powrócą do wolniejszego pobierania w jednym strumieniu, więc umieść hosty Xet na liście dozwolonych, aby pozostały na szybkiej ścieżce. Instalacje w pełni offline mogą to wszystko pominąć i zamiast tego użyć [Import pakietu offline](/pl/guide/deployment).

Informacje na temat konfiguracji odwrotnego proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels) można znaleźć w [Przewodniku wdrażania](/pl/guide/deployment#reverse-proxy).

## Sekrety Docker {#docker-secrets}

Dla wdrożeń produkcyjnych unikaj przekazywania sekretów jako zmiennych środowiskowych w postaci zwykłego tekstu. Punkt wejścia obsługuje konwencję `_FILE` Dockera: zamontuj sekret jako plik i ustaw odpowiednią zmienną `_FILE` na jego ścieżkę.

**Obsługiwane sekrety:**

| Zmienna | Odpowiednik `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Przykład z sekretami Docker Compose:**

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
Sekrety Docker Compose (bez Swarm) wymagają Compose v2.23 lub nowszego.
:::

## Wdrożenie Kubernetes {#kubernetes-deployment}

Punkt wejścia wykrywa, kiedy kontener już działa jako nie-root (np. przez `runAsUser` Kubernetes) i automatycznie pomija obniżenie uprawnień gosu. W takim przypadku nie może sam zmienić własności zamontowanych wolumenów przez chown, więc weryfikuje, czy są zapisywalne, i wcześnie kończy z praktycznymi wskazówkami, jeśli nie są, zobacz [Uprawnienia pamięci masowej](/pl/guide/deployment#storage-permissions) po `fsGroup` i konfiguracje z obcym UID (TrueNAS, OpenShift).

**Zalecany SecurityContext poda:**

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

Ponieważ `runAsUser: 999` jest ustawione na poziomie poda, punkt wejścia całkowicie pomija gosu. Pozwala to na uprawnienia `allowPrivilegeEscalation: false` i `drop: [ALL]` bez konfliktu.

Po dobór rozmiaru zasobów zobacz [Wymagania sprzętowe](/pl/guide/deployment#hardware-requirements).

## Kopia zapasowa i odzyskiwanie {#backup-and-recovery}

Produkcyjny stos Compose definiuje cztery woluminy. Zatrzymaj ruch wejściowy i poczekaj na zakończenie aktywnych zadań przed wykonaniem skoordynowanej kopii zapasowej, tak aby PostgreSQL, Redis i stan pliku opisywały ten sam punkt w czasie.

|Tom|Zawartość|Leczenie regeneracyjne|
|---|---|---|
|`SnapOtter-pgdata`|Użytkownicy PostgreSQL, ustawienia, potoki, zadania, metadane plików i dziennik audytu|Krytyczny; użyj niezawodnego zrzutu logicznego do odzyskiwania przenośnego|
|`SnapOtter-data`|Zapisane obiekty biblioteki, dzienniki i stan AI (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|Utwórz kopię zapasową całego woluminu; aby zaoszczędzić miejsce, celowo pomiń cały stan AI i zainstaluj ponownie jego pakiety|
|`SnapOtter-redisdata`|Redis AOF dla trwałego stanu kolejki BullMQ|Utwórz kopię zapasową po wstrzymaniu aplikacji i wymuszeniu `SAVE`; wymagane do dokładnego wznowienia pracy w kolejce|
|`SnapOtter-workspace`|Tymczasowe klucze do przechowywania obiektów (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|Nie twórz kopii zapasowych po wyczerpaniu lub anulowaniu wszystkich zadań; nigdy go nie wyrzucaj, gdy zadania są aktywne|

Funkcja Compose zwykle poprzedza nazwy woluminów nazwą projektu. Rozwiąż rzeczywisty wolumin źródłowy z zamontowanego kontenera, zamiast zakładać, że nazwa wyświetlana, taka jak `SnapOtter-data`, jest nazwą woluminu Docker.

### Kopia zapasowa bazy danych {#database-backup}

Użyj niestandardowego formatu archiwum PostgreSQL i zweryfikuj archiwum, zanim potraktujesz kopię zapasową jako kompletną:

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

Przetestuj każdą kopię zapasową, przywracając ją do izolowanego stosu, sprawdzając rekordy bazy danych i sumy kontrolne plików oraz uruchamiając aplikację. `tests/qa/backup-restore-drill.sh` repozytorium automatyzuje tę bramkę zwolnienia w stosunku do jawnego `QA_IMAGE`.

Jeśli zamiast tego Twoja platforma wykonuje migawki woluminów spójne w czasie awarii, najpierw zatrzymaj cały stos i wykonaj migawkę wszystkich krytycznych woluminów jako jeden zestaw. Surowa kopia katalogu danych PostgreSQL z działającego kontenera nie jest obsługiwaną logiczną kopią zapasową.

### Kopia zapasowa plików i kolejek {#file-and-queue-backup}

Wstrzymaj aplikację przed przechwyceniem woluminów plików i kolejek. Użyj `docker inspect`, aby rozwiązać rzeczywistą nazwę woluminu, wymuś na Redis zachowanie bieżącego stanu i zarchiwizuj z zachowaniem własności i uprawnień:

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

Uruchom ponownie Redis przed aplikacją. Jeśli celowo wykluczysz `/data/ai`, usuń całe poddrzewo AI, zamiast zachowywać rekord `installed.json` bez jego modeli i środowiska wirtualnego. Przechowuj pliki kopii zapasowych w sposób szyfrowany, z kontrolą dostępu i oddzielnie od hosta, na którym działa SnapOtter.

## Artefakty zgodności {#compliance-artifacts}

Każde wydanie SnapOtter zawiera następujące artefakty zabezpieczeń:

| Artefakt | Format | Gdzie to znaleźć |
|---|---|---|
| Zwolnij powiązanie tematu | Atest kanoniczny JSON + GitHub | [Wydanie GitHub](https://github.com/snapotter-hq/SnapOtter/releases) zasób: `snapotter-v{version}-release-subjects.json` |
| Archiwum SBOM | CycloneDX i SPDX JSON | Wydanie zasobów: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Obraz SBOM | CycloneDX i SPDX JSON | Wydanie zasobów: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Skanowanie podatności | Trivy JSON | Zwolnij zasoby z pasującymi prefiksami `archive-linux-{arch}` lub `image-linux-{arch}` |
| Skanowanie podatności | SARIF | Zakładka [Zabezpieczenia GitHub](https://github.com/snapotter-hq/SnapOtter/security). |
| Analiza statyczna | CodeQL (JS/TS + Python) | Karta [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), uruchamiana co tydzień + za PR |
| Przegląd zależności | Natywny GitHub | Kontrola na PR kończy się niepowodzeniem w przypadku dodatków o dużej ważności |
| Audyt zależności Python | pip-audit | Dziennik przebiegu CI przy każdym naciśnięciu |
| Polityka bezpieczeństwa | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) w repozytorium |
| Aktualizacje zależności | Dependabot | Zautomatyzowane cotygodniowe PR dla npm, pip, Docker, Actions |

**Uruchamianie własnego skanowania:**

Pobierz manifest tematu wydania i sprawdź, czy został on potwierdzony w przepływie pracy wydania:

```bash
gh attestation verify snapotter-v2.2.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Manifest rejestruje oddzielnie `releaseTag`, `releaseCommit` i `workflowTriggerCommit`. Sprawdź, czy `releaseCommit` jest zatwierdzeniem usuniętym z niezmiennego znacznika, a następnie sprawdź skrót SHA-256 archiwum, obrazu, SBOM lub skanu, który wykorzystujesz, względem jego wpisu w `subjects`. To rozróżnienie jest zamierzone: sprawdzenie nowo utworzonego zatwierdzenia wydania nie zmienia tożsamości zatwierdzenia w poświadczeniu OIDC przepływu pracy.

Możesz także zeskanować pobrany plik SBOM lub obraz bezpośrednio:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.2.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.2.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.2.0
```

::: info
Obraz SBOMs i skany odzwierciedlają dokładnie obraz specyficzny dla architektury opublikowany dla tej wersji. Archiwum SBOMs i skany opisują wstępnie zbudowane archiwum osobno. Pakiety modelu AI zainstalowane po wdrożeniu nie są uwzględnione w tych pakietach SBOMs, ponieważ są pobierane w czasie wykonywania.
:::
