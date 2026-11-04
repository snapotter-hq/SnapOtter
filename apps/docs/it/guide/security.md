---
description: "Guida all'hardening della sicurezza di SnapOtter. Sicurezza dei container, isolamento di rete, Docker secrets, distribuzione su Kubernetes e artefatti di conformità."
i18n_source_hash: 630381c08cde
i18n_provenance: machine
i18n_output_hash: 9bdf09a80d40
i18n_hash_version: 2
---

# Sicurezza e hardening {#security-hardening}

SnapOtter elabora i file interamente sulla Sua infrastruttura. Per impostazione predefinita invia analytics di prodotto anonime, prive di contenuti, e segnalazioni di crash per contribuire a migliorare il progetto. Non invia mai i Suoi file, i nomi dei file, i contenuti dei file, l'output dell'OCR, i metadati delle immagini né il testo dei documenti. Il feedback facoltativo viene inviato solo dopo che un utente lo ha inviato, solo quando le analytics sono abilitate, e i campi di contatto sono inclusi solo con esplicito consenso al contatto. Un amministratore può disattivare le analytics e la raccolta del feedback con un clic in Impostazioni > Sistema > Privacy, senza bisogno di ricompilare. L'elaborazione dei file resta sempre all'interno del Suo container.

Il container viene eseguito come utente dedicato non root (`snapotter`) con tutte le capability Linux rimosse tranne l'insieme minimo richiesto. Per la politica completa di divulgazione delle vulnerabilità e per l'architettura di sicurezza, consulti [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) su GitHub.

## Hardening del container {#container-hardening}

I file Compose canonici per [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) e [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) sono la fonte di verità. Non copi in produzione un esempio abbreviato; distribuisca il file dal tag di rilascio che ha verificato.

Entrambi gli stack applicano i seguenti controlli:

- I limiti di memoria, swap, CPU e PID contengono l'elaborazione nativa fuori controllo.
- Ogni servizio rimuove tutte le capability Linux. L'applicazione riaggiunge solo `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` per la proprietà dei volumi, il passaggio di identità unidirezionale `gosu` e l'inoltro ordinato dei segnali. PostgreSQL e Redis ricevono solo il sottoinsieme di cui hanno bisogno i loro entrypoint ufficiali.
- `security_opt: [no-new-privileges:true]` impedisce ai processi nei container dell'applicazione, di PostgreSQL e di Redis di ottenere privilegi aggiuntivi. Questo resta compatibile con `gosu`: l'entrypoint parte come root, prepara i volumi e passa solo all'utente dedicato `snapotter`.
- Gli input delle immagini PostgreSQL e Redis sono bloccati tramite digest. Analogamente, l'applicazione dovrebbe essere bloccata a un tag di rilascio o a un digest verificato invece di `latest`.
- Controlli dello stato, rotazione limitata dei log JSON, AOF di Redis durevole e policy di riavvio sono definiti centralmente nei file canonici.

Per una distribuzione esposta a Internet, associ la porta 1349 al loopback e termini TLS su un reverse proxy mantenuto. Generi credenziali PostgreSQL e Redis univoche, conservi i segreti in file protetti o in un gestore di segreti e cambi subito la password amministratore iniziale.

### Perché `read_only` non è impostato {#why-read-only-is-not-set}

`read_only: true` non è impostato perché la rimappatura di PUID/PGID scrive in `/etc/passwd` e `/etc/group` all'avvio. Se usa il flag `--user` di Docker o `runAsUser` di Kubernetes al posto di PUID/PGID, può abilitare in sicurezza un filesystem root di sola lettura.

## Isolamento di rete {#network-isolation}

L'elaborazione dei file è locale, ma un'installazione predefinita **non è un sistema privo di traffico in uscita**. Le analytics di prodotto anonime usano PostHog e la segnalazione dei crash usa Sentry quando la telemetria è abilitata. Imposti `SNAPOTTER_TELEMETRY=0` (oppure disabiliti le analytics in Impostazioni > Sistema > Privacy) per disattivare entrambi. SnapOtter non include mai file caricati, nomi dei file, output OCR, testo dei documenti o altri contenuti dei file in quegli eventi.

Il resto del traffico in uscita dipende dalle funzionalità: l'installazione di bundle/modelli AI scarica input di rilascio firmati; l'importazione da URL recupera un URL pubblico richiesto dall'utente; e le integrazioni configurate esplicitamente, come OIDC, SAML, OpenTelemetry, webhook, archiviazione compatibile con S3 o simili, contattano le destinazioni scelte dall'amministratore. I download di modelli a runtime sono disabilitati per impostazione predefinita. Imposti `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` solo per abilitare esplicitamente i download di fallback automatici. Un'[importazione offline dei bundle](/it/guide/deployment) può predisporre le funzionalità AI senza traffico in uscita per i modelli a runtime.

**Raccomandazioni per il firewall:**

| Scenario | Regola in uscita |
|---|---|
| Air-gapped | Imposti `SNAPOTTER_TELEMETRY=0` e `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, usi l'importazione offline dei bundle AI, disabiliti l'importazione da URL e le integrazioni esterne, quindi blocchi il traffico in uscita |
| Telemetria predefinita | Consenta gli endpoint PostHog e Sentry elencati dai log del browser/della rete; disabiliti la telemetria se la policy non li consente |
| Bundle AI necessari | Durante l'installazione, consenta HTTPS verso `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; poi blocchi quegli host |
| Integrazioni esterne | Consenta solo le destinazioni OIDC/SAML/OTLP/webhook/object storage esatte configurate dall'amministratore |

Gli archivi dei bundle sono serviti dall'archiviazione Xet di Hugging Face, che trasferisce attraverso gli endpoint `*.xethub.hf.co` in parallelo ed è ciò che rende veloci i download di bundle da diversi GB. Se il firewall consente `huggingface.co` ma blocca `*.xethub.hf.co`, le installazioni riescono comunque ma ripiegano su un download a flusso singolo più lento, quindi inserisca in allowlist gli host Xet per restare sul percorso veloce. Le installazioni completamente offline possono saltare tutto questo e usare invece l'[importazione offline dei bundle](/it/guide/deployment).

Per la configurazione del reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), consulti la [guida alla distribuzione](/it/guide/deployment#reverse-proxy).

## Docker Secrets {#docker-secrets}

Per le distribuzioni di produzione, eviti di passare i segreti come variabili d'ambiente in chiaro. L'entrypoint supporta la convenzione `_FILE` di Docker: monti un segreto come file e imposti la corrispondente variabile `_FILE` sul suo percorso.

**Segreti supportati:**

| Variabile | Equivalente `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Esempio con i segreti di Docker Compose:**

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
I segreti di Docker Compose (senza Swarm) richiedono Compose v2.23 o successivo.
:::

## Distribuzione su Kubernetes {#kubernetes-deployment}

L'entrypoint rileva quando il container è già in esecuzione come non root (ad esempio tramite `runAsUser` di Kubernetes) e salta automaticamente il passaggio di privilegi con gosu. In tal caso non può eseguire chown sui volumi montati, quindi verifica che siano scrivibili e termina subito con indicazioni operative in caso contrario: consulti [Permessi di archiviazione](/it/guide/deployment#storage-permissions) per `fsGroup` e le configurazioni con UID esterno (TrueNAS, OpenShift).

**SecurityContext del Pod consigliato:**

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

Poiché `runAsUser: 999` è impostato a livello di pod, l'entrypoint salta completamente gosu. Questo consente le capability `allowPrivilegeEscalation: false` e `drop: [ALL]` senza conflitti.

Per il dimensionamento delle risorse, consulti [Requisiti hardware](/it/guide/deployment#hardware-requirements).

## Backup e ripristino {#backup-and-recovery}

Lo stack Compose di produzione definisce quattro volumi. Interrompa l'ingresso e lasci terminare i job attivi prima di eseguire un backup coordinato, in modo che PostgreSQL, Redis e lo stato dei file descrivano lo stesso punto nel tempo.

| Volume | Contenuto | Trattamento per il ripristino |
|---|---|---|
| `SnapOtter-pgdata` | Utenti, impostazioni, pipeline, job, metadati dei file e log di audit di PostgreSQL | Critico; usi un dump logico fail-fast per un ripristino portabile |
| `SnapOtter-data` | Oggetti salvati nella libreria, log e stato AI (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Esegua il backup dell'intero volume; per risparmiare spazio, ometta deliberatamente tutto lo stato AI e reinstalli i relativi bundle |
| `SnapOtter-redisdata` | AOF di Redis per lo stato durevole della coda BullMQ | Esegua il backup dopo aver messo in pausa l'app e forzato `SAVE`; necessario per riprendere esattamente il lavoro in coda |
| `SnapOtter-workspace` | Chiavi temporanee dell'object storage (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | Non ne faccia il backup dopo che tutti i job sono stati svuotati o annullati; non lo scarti mai mentre ci sono job attivi |

Compose normalmente antepone il nome del progetto ai nomi dei volumi. Risolva il vero volume di origine a partire dal container montato, invece di presumere che un nome visualizzato come `SnapOtter-data` sia il nome del volume Docker.

### Backup del database {#database-backup}

Usi il formato archivio personalizzato di PostgreSQL e verifichi l'archivio prima di considerare completo il backup:

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

Provi ogni backup ripristinandolo in uno stack isolato, controllando i record del database e i checksum dei file e avviando l'applicazione. Il `tests/qa/backup-restore-drill.sh` del repository automatizza quel controllo di rilascio rispetto a un `QA_IMAGE` esplicito.

Se la Sua piattaforma esegue invece snapshot dei volumi coerenti in caso di crash, fermi prima l'intero stack e crei lo snapshot di tutti i volumi critici come un unico insieme. Una copia grezza della directory dati di PostgreSQL da un container in esecuzione non è un backup logico supportato.

### Backup di file e code {#file-and-queue-backup}

Metta in pausa l'applicazione prima di acquisire i volumi di file e code. Usi `docker inspect` per risolvere il nome effettivo del volume, forzi Redis a rendere persistente il suo stato corrente e archivi preservando proprietà e permessi:

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

Riavvii Redis prima dell'applicazione. Se esclude intenzionalmente `/data/ai`, rimuova l'intero sottoalbero AI invece di conservare un record `installed.json` senza i suoi modelli o il suo ambiente virtuale. Mantenga i file di backup cifrati, con accesso controllato e separati dall'host che esegue SnapOtter.

## Artefatti di conformità {#compliance-artifacts}

Ogni rilascio di SnapOtter include i seguenti artefatti di sicurezza:

| Artefatto | Formato | Dove trovarlo |
|---|---|---|
| Binding del soggetto della release | JSON canonico + attestazione GitHub | Asset della [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| SBOM dell'archivio | CycloneDX e SPDX JSON | Asset della release: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| SBOM dell'immagine | CycloneDX e SPDX JSON | Asset della release: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Scansioni delle vulnerabilità | Trivy JSON | Asset della release con prefissi `archive-linux-{arch}` o `image-linux-{arch}` corrispondenti |
| Scansione delle vulnerabilità | SARIF | Scheda [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Analisi statica | CodeQL (JS/TS + Python) | Scheda [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), eseguita ogni settimana + a ogni PR |
| Revisione delle dipendenze | Nativa di GitHub | Controllo per PR, fallisce in caso di aggiunte ad alta gravità |
| Audit delle dipendenze Python | pip-audit | Log di esecuzione CI a ogni push |
| Politica di sicurezza | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) nel repository |
| Aggiornamenti delle dipendenze | Dependabot | PR settimanali automatiche per npm, pip, Docker, Actions |

**Eseguire la propria scansione:**

Scarichi il manifest del soggetto della release e verifichi che sia stato attestato dal workflow di rilascio:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Il manifest registra separatamente `releaseTag`, `releaseCommit` e `workflowTriggerCommit`. Verifichi che `releaseCommit` sia il commit ricavato dal tag immutabile, poi verifichi il digest SHA-256 dell'archivio, dell'immagine, dell'SBOM o della scansione che utilizza rispetto alla sua voce in `subjects`. Questa distinzione è intenzionale: effettuare il checkout di un commit di rilascio appena creato non cambia l'identità del commit nella credenziale OIDC del workflow.

Può anche analizzare un SBOM scaricato o direttamente l'immagine:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
Gli SBOM e le scansioni dell'immagine riflettono l'esatta immagine specifica per architettura pubblicata per quella release. Gli SBOM e le scansioni dell'archivio descrivono separatamente l'archivio precompilato. I bundle di modelli AI installati dopo la distribuzione non sono inclusi in questi SBOM perché vengono scaricati a runtime.
:::
