---
description: "Przewodnik po wzmacnianiu bezpieczeństwa SnapOtter. Bezpieczeństwo kontenerów, izolacja sieci, sekrety Docker, wdrożenie Kubernetes i artefakty zgodności."
i18n_source_hash: 986f7658430c
i18n_provenance: human
i18n_output_hash: c616d661a5d1
---

# Bezpieczeństwo i wzmacnianie {#security-hardening}

SnapOtter przetwarza pliki w całości na twojej infrastrukturze. Domyślnie wysyła anonimową, pozbawioną treści analitykę produktu i raporty o awariach, aby pomóc ulepszać projekt. Nigdy nie wysyła twoich plików, nazw plików, zawartości plików, wyniku OCR, metadanych obrazów ani tekstu dokumentów. Opcjonalna informacja zwrotna jest wysyłana dopiero po jej przesłaniu przez użytkownika, tylko gdy analityka jest włączona, a pola kontaktowe są dołączane wyłącznie za wyraźną zgodą na kontakt. Administrator może wyłączyć analitykę i zbieranie informacji zwrotnej jednym kliknięciem w Ustawienia > System > Prywatność, bez konieczności przebudowy. Przetwarzanie plików zawsze pozostaje wewnątrz twojego kontenera.

Kontener działa jako dedykowany użytkownik nie-root (`snapotter`) z odrzuconymi wszystkimi uprawnieniami Linuksa poza minimalnym wymaganym zestawem. Po pełną politykę ujawniania podatności i architekturę bezpieczeństwa zobacz [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) na GitHub.

## Wzmacnianie kontenera {#container-hardening}

[Domyślny docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) zawiera produkcyjne wzmacnianie bezpieczeństwa. Oto rozbicie każdej opcji i wyjaśnienie, dlaczego ma znaczenie:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      # Bind to localhost only for internet-facing deployments:
      - "127.0.0.1:1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_PASSWORD=change-me-immediately
      - RATE_LIMIT_PER_MIN=1000
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

    # --- Resource limits ---
    mem_limit: 6g            # Prevents runaway memory from crashing the host
    memswap_limit: 6g        # No swap - fail fast instead of degrading the host
    cpus: 4                  # Cap CPU usage to 4 cores
    pids_limit: 512          # Prevents fork bombs

    # --- Capability restrictions ---
    cap_drop:
      - ALL                  # Drop ALL Linux capabilities first
    cap_add:
      - CHOWN                # Needed for volume permission setup
      - SETUID               # Needed for gosu privilege drop (root -> snapotter)
      - SETGID               # Needed for gosu privilege drop
      - DAC_OVERRIDE         # Needed for volume permission setup
      - FOWNER               # Needed for volume permission setup

    # --- Logging ---
    logging:
      driver: json-file
      options:
        max-size: "50m"      # Rotate logs at 50 MB
        max-file: "5"        # Keep 5 rotated log files

    # --- Health check ---
    healthcheck:
      test: ["CMD", "curl", "-sf", "--max-time", "5", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3

    shm_size: "2gb"          # Required for Python ML shared memory
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

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
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

### Dlaczego `no-new-privileges` nie jest ustawione {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` jest celowo pominięte. Punkt wejścia startuje jako root, aby naprawić własność wolumenów, a następnie schodzi do użytkownika `snapotter` przez [gosu](https://github.com/tianon/gosu), które wymaga setuid. Po ukończeniu obniżenia uprawnień proces działa jako `snapotter` z usuniętymi wszystkimi uprawnieniami poza pięcioma wymienionymi powyżej.

Jeśli używasz Kubernetes lub flagi `--user` Dockera, aby uruchomić bezpośrednio jako nie-root (omijając gosu), `no-new-privileges` można bezpiecznie włączyć.

### Dlaczego `read_only` nie jest ustawione {#why-read-only-is-not-set}

`read_only: true` nie jest ustawione, ponieważ remapowanie PUID/PGID zapisuje do `/etc/passwd` i `/etc/group` przy uruchamianiu. Jeśli używasz flagi `--user` Dockera lub `runAsUser` Kubernetes zamiast PUID/PGID, możesz bezpiecznie włączyć system plików root tylko do odczytu.

## Izolacja sieci {#network-isolation}

Podczas normalnej pracy kontener nawiązuje **zero wychodzących połączeń sieciowych**. Całe przetwarzanie plików odbywa się lokalnie z użyciem dołączonych bibliotek.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Jedynym wyjątkiem są **pobrania modeli AI**: gdy użytkownik instaluje pakiet funkcji AI przez interfejs, kontener pobiera gotowe archiwum pakietu z Hugging Face plus kilka pojedynczych plików modeli z GitHub Releases, Google Storage i PyPI. Te pobrania odbywają się raz na pakiet i są przechowywane w wolumenie `/data`.

**Zalecenia dotyczące zapory sieciowej:**

| Scenariusz | Reguła wychodząca |
|---|---|
| Odizolowany od sieci (bez AI) | Zablokuj cały ruch wychodzący z kontenera |
| Potrzebne pakiety AI | Zezwól na HTTPS do `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org` podczas instalacji, następnie zablokuj |
| Po instalacji AI | Zablokuj cały ruch wychodzący, modele są buforowane lokalnie |

Archiwa pakietów są serwowane z pamięci masowej Xet Hugging Face, która przesyła przez punkty końcowe `*.xethub.hf.co` równolegle i to właśnie sprawia, że pobrania wielogigabajtowych pakietów są szybkie. Jeśli twoja zapora zezwala na `huggingface.co`, ale blokuje `*.xethub.hf.co`, instalacje nadal się powodzą, ale przechodzą na wolniejsze pobieranie jednostrumieniowe, więc dodaj hosty Xet do listy dozwolonych, aby pozostać na szybkiej ścieżce. W pełni offline instalacje mogą pominąć to wszystko i zamiast tego użyć [Importu pakietów offline](/pl/guide/deployment).

Po konfigurację reverse proxy (Nginx, Traefik, Caddy, Tunele Cloudflare) zobacz [Przewodnik wdrożenia](/pl/guide/deployment#reverse-proxy).

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

## Kopie zapasowe i odzyskiwanie {#backup-and-recovery}

Trwały stan jest podzielony na dwa wolumeny:

| Wolumen | Zawartość | Krytyczny? |
|---|---|---|
| `SnapOtter-pgdata` | Baza danych PostgreSQL (użytkownicy, ustawienia, potoki, zadania, dziennik audytu) | Tak |
| `/data` (wolumen aplikacji) | Pliki przesłane przez użytkownika, modele AI, venv Pythona | Częściowo (patrz niżej) |

W obrębie wolumenu `/data`:

| Ścieżka | Zawartość | Krytyczna? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Pliki użytkownika i wyniki przetwarzania | Tak |
| `/data/ai/` | Pobrane pliki modeli AI | Nie (do ponownego pobrania) |
| `/data/venv/` | Wirtualne środowisko Pythona | Nie (odbudowywane przy starcie) |

### Kopia zapasowa bazy danych {#database-backup}

Użyj `pg_dump`, aby wykonać kopię zapasową bazy danych podczas działania stosu:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Alternatywnie zatrzymaj stos i wykonaj migawkę wolumenu `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Kopia zapasowa plików użytkownika {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

Modele AI wynoszą łącznie do około 24 GB dla wszystkich pakietów. Ponieważ można je ponownie pobrać, wyłącz `/data/ai/` i `/data/venv/` z kopii zapasowych, aby zaoszczędzić miejsce. Tylko baza danych i pliki użytkownika są krytyczne.

## Artefakty zgodności {#compliance-artifacts}

Każde wydanie SnapOtter zawiera następujące artefakty bezpieczeństwa:

| Artefakt | Format | Gdzie go znaleźć |
|---|---|---|
| SBOM (CycloneDX) | JSON | Zasób [Wydania GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Zasób [Wydania GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| Skan podatności | Trivy JSON | Zasób [Wydania GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| Skan podatności | SARIF | Zakładka [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Analiza statyczna | CodeQL (JS/TS + Python) | Zakładka [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), uruchamiana co tydzień + na każdy PR |
| Przegląd zależności | Natywny GitHub | Kontrola na PR, zawodzi przy dodaniach o wysokiej wadze |
| Audyt zależności Pythona | pip-audit | Log uruchomienia CI przy każdym push |
| Polityka bezpieczeństwa | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) w repozytorium |
| Aktualizacje zależności | Dependabot | Zautomatyzowane cotygodniowe PR dla npm, pip, Docker, Actions |

**Uruchamianie własnego skanu:**

Pobierz SBOM z wydania i przeskanuj go preferowanym narzędziem:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM i skan podatności odzwierciedlają dokładny obraz opublikowany dla tego wydania. Pakiety modeli AI zainstalowane po wdrożeniu nie są uwzględnione w SBOM, ponieważ są pobierane w czasie działania.
:::
