---
description: "Guida al rafforzamento della sicurezza per SnapOtter. Sicurezza del container, isolamento di rete, Docker secrets, distribuzione Kubernetes e artefatti di conformità."
i18n_source_hash: 986f7658430c
i18n_provenance: human
i18n_output_hash: 24c63a8f7f16
---

# Sicurezza e rafforzamento {#security-hardening}

SnapOtter elabora i file interamente sulla tua infrastruttura. Invia analytics di prodotto anonime e prive di contenuti e report di crash per impostazione predefinita, per aiutare a migliorare il progetto. Non invia mai i tuoi file, i nomi dei file, il contenuto dei file, l'output OCR, i metadati delle immagini o il testo dei documenti. Il feedback facoltativo viene inviato solo dopo che un utente lo ha inviato, solo quando le analytics sono abilitate, e i campi di contatto sono inclusi solo con esplicito consenso al contatto. Un amministratore può disattivare la raccolta di analytics e feedback con un solo clic in Impostazioni > Sistema > Privacy, senza bisogno di ricostruzione. L'elaborazione dei file resta sempre all'interno del tuo container.

Il container gira come utente non-root dedicato (`snapotter`) con tutte le capacità Linux rimosse tranne il set minimo richiesto. Per la policy completa di divulgazione delle vulnerabilità e l'architettura di sicurezza, vedi [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) su GitHub.

## Rafforzamento del container {#container-hardening}

Il [docker-compose.yml predefinito](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) include il rafforzamento della sicurezza per la produzione. Ecco una descrizione di ciascuna opzione e del perché è importante:

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

### Perché `no-new-privileges` non è impostato {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` è volutamente omesso. L'entrypoint parte come root per correggere la proprietà dei volumi, poi scende all'utente `snapotter` tramite [gosu](https://github.com/tianon/gosu), che richiede setuid. Una volta completata la riduzione dei privilegi, il processo gira come `snapotter` con tutte le capacità rimosse tranne le cinque elencate sopra.

Se usi Kubernetes o il flag `--user` di Docker per eseguire direttamente come non-root (bypassando gosu), `no-new-privileges` può essere abilitato in sicurezza.

### Perché `read_only` non è impostato {#why-read-only-is-not-set}

`read_only: true` non è impostato perché il rimappaggio PUID/PGID scrive su `/etc/passwd` e `/etc/group` all'avvio. Se usi il flag `--user` di Docker o `runAsUser` di Kubernetes invece di PUID/PGID, puoi abilitare in sicurezza un filesystem root di sola lettura.

## Isolamento di rete {#network-isolation}

Durante il normale funzionamento, il container effettua **zero connessioni di rete in uscita**. Tutta l'elaborazione dei file avviene localmente usando librerie integrate.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

L'unica eccezione sono i **download dei modelli AI**: quando un utente installa un bundle di funzionalità AI tramite l'interfaccia, il container scarica l'archivio del bundle pre-costruito da Hugging Face, più alcuni singoli file di modelli da GitHub Releases, Google Storage e PyPI. Questi download avvengono una volta per bundle e sono memorizzati nel volume `/data`.

**Raccomandazioni sul firewall:**

| Scenario | Regola in uscita |
|---|---|
| Air-gapped (senza AI) | Blocca tutto il traffico in uscita dal container |
| Bundle AI necessari | Consenti HTTPS verso `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org` durante l'installazione, poi blocca |
| Dopo l'installazione AI | Blocca tutto il traffico in uscita, i modelli sono memorizzati nella cache locale |

Gli archivi dei bundle vengono serviti dall'archiviazione Xet di Hugging Face, che trasferisce in parallelo attraverso gli endpoint `*.xethub.hf.co` ed è ciò che rende veloci i download di bundle da diversi GB. Se il tuo firewall consente `huggingface.co` ma blocca `*.xethub.hf.co`, le installazioni riescono comunque ma ripiegano su un download a flusso singolo più lento, quindi metti in allowlist gli host Xet per restare sul percorso veloce. Le installazioni completamente offline possono saltare tutto questo e usare invece l'[Importazione di bundle offline](/it/guide/deployment).

Per la configurazione del reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), vedi la [guida alla distribuzione](/it/guide/deployment#reverse-proxy).

## Docker Secrets {#docker-secrets}

Per le distribuzioni in produzione, evita di passare i segreti come variabili d'ambiente in chiaro. L'entrypoint supporta la convenzione `_FILE` di Docker: monta un segreto come file e imposta la corrispondente variabile `_FILE` sul suo percorso.

**Segreti supportati:**

| Variabile | Equivalente `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Esempio con i secrets di Docker Compose:**

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
I secrets di Docker Compose (senza Swarm) richiedono Compose v2.23 o successivo.
:::

## Distribuzione Kubernetes {#kubernetes-deployment}

L'entrypoint rileva quando il container è già in esecuzione come non-root (ad es. tramite `runAsUser` di Kubernetes) e salta automaticamente la riduzione dei privilegi gosu. In quel caso non può fare il chown dei volumi montati da solo, quindi verifica che siano scrivibili ed esce subito con indicazioni pratiche se non lo sono, vedi [Permessi di archiviazione](/it/guide/deployment#storage-permissions) per `fsGroup` e le configurazioni con UID estraneo (TrueNAS, OpenShift).

**SecurityContext del pod consigliato:**

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

Poiché `runAsUser: 999` è impostato a livello di pod, l'entrypoint salta del tutto gosu. Questo consente le capacità `allowPrivilegeEscalation: false` e `drop: [ALL]` senza conflitti.

Per il dimensionamento delle risorse, vedi [Requisiti hardware](/it/guide/deployment#hardware-requirements).

## Backup e ripristino {#backup-and-recovery}

Lo stato persistente è suddiviso su due volumi:

| Volume | Contenuti | Critico? |
|---|---|---|
| `SnapOtter-pgdata` | Database PostgreSQL (utenti, impostazioni, pipeline, job, log di audit) | Sì |
| `/data` (volume app) | File caricati dagli utenti, modelli AI, venv Python | Parzialmente (vedi sotto) |

All'interno del volume `/data`:

| Percorso | Contenuti | Critico? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | File utente e risultati di elaborazione | Sì |
| `/data/ai/` | File di modelli AI scaricati | No (riscaricabili) |
| `/data/venv/` | Ambiente virtuale Python | No (ricostruito all'avvio) |

### Backup del database {#database-backup}

Usa `pg_dump` per eseguire il backup del database mentre lo stack è in esecuzione:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

In alternativa, ferma lo stack e crea uno snapshot del volume `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Backup dei file utente {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

I modelli AI ammontano fino a circa 24 GB su tutti i bundle. Poiché sono riscaricabili, escludi `/data/ai/` e `/data/venv/` dai backup per risparmiare spazio. Solo il database e i file utente sono critici.

## Artefatti di conformità {#compliance-artifacts}

Ogni release di SnapOtter include i seguenti artefatti di sicurezza:

| Artefatto | Formato | Dove trovarlo |
|---|---|---|
| SBOM (CycloneDX) | JSON | Asset della [release GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Asset della [release GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| Scansione delle vulnerabilità | Trivy JSON | Asset della [release GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| Scansione delle vulnerabilità | SARIF | Scheda [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Analisi statica | CodeQL (JS/TS + Python) | Scheda [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), eseguita settimanalmente + per PR |
| Revisione delle dipendenze | Nativa di GitHub | Controllo per PR, fallisce sulle aggiunte ad alta gravità |
| Audit delle dipendenze Python | pip-audit | Log di esecuzione CI a ogni push |
| Policy di sicurezza | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) nel repository |
| Aggiornamenti delle dipendenze | Dependabot | PR settimanali automatiche per npm, pip, Docker, Actions |

**Eseguire la tua scansione:**

Scarica l'SBOM dalla release e scansionalo con lo strumento che preferisci:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
L'SBOM e la scansione delle vulnerabilità riflettono l'immagine esatta pubblicata per quella release. I bundle di modelli AI installati dopo la distribuzione non sono inclusi nell'SBOM poiché vengono scaricati a runtime.
:::
