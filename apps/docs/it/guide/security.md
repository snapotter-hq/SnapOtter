---
description: "Guida al rafforzamento della sicurezza per SnapOtter. Sicurezza del container, isolamento di rete, Docker secrets, distribuzione Kubernetes e artefatti di conformità."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: f1901f67dfe4
i18n_hash_version: 2
---

# Sicurezza e rafforzamento {#security-hardening}

SnapOtter elabora i file interamente sulla tua infrastruttura. Invia analytics di prodotto anonime e prive di contenuti e report di crash per impostazione predefinita, per aiutare a migliorare il progetto. Non invia mai i tuoi file, i nomi dei file, il contenuto dei file, l'output OCR, i metadati delle immagini o il testo dei documenti. Il feedback facoltativo viene inviato solo dopo che un utente lo ha inviato, solo quando le analytics sono abilitate, e i campi di contatto sono inclusi solo con esplicito consenso al contatto. Un amministratore può disattivare la raccolta di analytics e feedback con un solo clic in Impostazioni > Sistema > Privacy, senza bisogno di ricostruzione. L'elaborazione dei file resta sempre all'interno del tuo container.

Il container gira come utente non-root dedicato (`snapotter`) con tutte le capacità Linux rimosse tranne il set minimo richiesto. Per la policy completa di divulgazione delle vulnerabilità e l'architettura di sicurezza, vedi [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) su GitHub.

## Indurimento del contenitore {#container-hardening}

I file canonici Compose [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) e [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) sono la fonte della verità. Non copiare un esempio abbreviato nella produzione; distribuisci il file dal tag di rilascio che hai verificato.

Entrambi gli stack applicano i seguenti controlli:

- I limiti di memoria, scambio, CPU e PID contengono un'elaborazione nativa fuori controllo.
- Ogni servizio elimina tutte le funzionalità di Linux. L'applicazione aggiunge nuovamente solo `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` per la proprietà del volume, il rilascio unidirezionale dell'identità `gosu` e l'inoltro regolare del segnale. PostgreSQL e Redis ricevono solo il sottoinsieme di cui hanno bisogno i loro punti di ingresso ufficiali.
- `security_opt: [no-new-privileges:true]` impedisce ai processi nell'applicazione, nei contenitori PostgreSQL e Redis di ottenere privilegi aggiuntivi. Questo rimane compatibile con `gosu`: il punto di ingresso inizia come root, prepara i volumi e scende solo all'utente `snapotter` dedicato.
- Gli input di immagini PostgreSQL e Redis sono bloccati da digest. Allo stesso modo, l'applicazione dovrebbe essere fissata a un tag di rilascio verificato o a un digest anziché a `latest`.
- I controlli di integrità, la rotazione limitata dei log JSON, l'AOF Redis durevole e la policy di riavvio sono definiti centralmente nei file canonici.

Per una distribuzione con connessione Internet, associare la porta 1349 al loopback e terminare TLS su un proxy inverso mantenuto. Genera credenziali PostgreSQL e Redis univoche, archivia i segreti in file protetti o in un gestore di segreti e modifica immediatamente la password iniziale dell'amministratore.

### Perché `read_only` non è impostato {#why-read-only-is-not-set}

`read_only: true` non è impostato perché la rimappatura PUID/PGID scrive su `/etc/passwd` e `/etc/group` all'avvio. Se utilizzi il flag `--user` di Docker o Kubernetes `runAsUser` invece di PUID/PGID, puoi abilitare in sicurezza un filesystem root di sola lettura.

## Isolamento della rete {#network-isolation}

L'elaborazione dei file è locale, ma un'installazione predefinita **non è un sistema egress-free**. L'analisi anonima dei prodotti utilizza PostHog e la segnalazione degli arresti anomali utilizza Sentry quando la telemetria è abilitata. Imposta `SNAPOTTER_TELEMETRY=0` (o disabilita l'analisi in Impostazioni > Sistema > Privacy) per disattivarli entrambi. SnapOtter non include mai file caricati, nomi di file, output OCR, testo di documenti o altri contenuti di file in tali eventi.

Il resto del traffico in uscita è basato sulle funzionalità: download di installazione di bundle/modelli AI, input di rilascio firmati; L'importazione dell'URL recupera un URL pubblico richiesto dall'utente; e OIDC, SAML, OpenTelemetry, webhook, storage compatibile con S3 o integrazioni simili esplicitamente configurati contattano le destinazioni scelte dall'amministratore. I download dei modelli in fase di esecuzione sono disabilitati per impostazione predefinita. Imposta `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` solo per abilitare esplicitamente i download di fallback automatici. Un'[importazione di bundle offline](/it/guide/deployment) può fornire funzionalità AI senza uscita dal modello runtime.

**Consigli sul firewall:**

|Scenario|Regola in uscita|
|---|---|
|Con intercapedine d'aria|Imposta `SNAPOTTER_TELEMETRY=0` e `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, utilizza l'importazione di bundle AI offline, disabilita l'importazione di URL e le integrazioni esterne, quindi blocca l'uscita|
|Telemetria predefinita|Consenti gli endpoint PostHog e Sentry elencati dai log del tuo browser/rete; disabilitare la telemetria se i criteri non lo consentono|
|Sono necessari pacchetti AI|Durante l'installazione, consenti HTTPS a `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; quindi blocca quegli host|
|Integrazioni esterne|Consenti solo le destinazioni OIDC/SAML/OTLP/webhook/object storage esatte configurate dall'amministratore|

Gli archivi dei bundle vengono serviti dallo storage Xet di Hugging Face, che trasferisce sugli endpoint `*.xethub.hf.co` in parallelo ed è ciò che rende veloci i download dei bundle multi-GB. Se il tuo firewall consente `huggingface.co` ma blocca `*.xethub.hf.co`, le installazioni riescono comunque, ma ricadono in un download a flusso singolo più lento, quindi consenti agli host Xet di rimanere sul percorso veloce. Le installazioni completamente offline possono saltare tutto questo e utilizzare invece [Importazione bundle offline](/it/guide/deployment).

Per la configurazione del proxy inverso (Nginx, Traefik, Caddy, Cloudflare Tunnels), consultare la [Guida all'implementazione](/it/guide/deployment#reverse-proxy).

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

Lo stack Compose di produzione definisce quattro volumi. Interrompi l'ingresso e lascia che i processi attivi finiscano prima di eseguire un backup coordinato in modo che PostgreSQL, Redis e lo stato dei file descrivano lo stesso momento.

|Volume|Contenuto|Trattamento di recupero|
|---|---|---|
|`SnapOtter-pgdata`|Utenti PostgreSQL, impostazioni, pipeline, processi, metadati di file e registro di controllo|Critico; utilizzare un dump logico fail-fast per il ripristino portatile|
|`SnapOtter-data`|Oggetti della libreria salvati, registri e stato AI (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|Eseguire il backup dell'intero volume; per risparmiare spazio, ometti deliberatamente tutti gli stati dell'IA e reinstalla i relativi bundle|
|`SnapOtter-redisdata`|Redis AOF per uno stato della coda BullMQ durevole|Eseguire il backup dopo aver messo in pausa l'app e forzato `SAVE`; necessario per riprendere esattamente il lavoro in coda|
|`SnapOtter-workspace`|Chiavi di archiviazione temporanea degli oggetti (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|Non eseguire il backup dopo che tutti i lavori sono stati svuotati o annullati; non scartarlo mai mentre i lavori sono attivi|

Compose normalmente prefissa i nomi dei volumi con il nome del progetto. Risolvi il volume di origine reale dal contenitore montato invece di presupporre che un nome visualizzato come `SnapOtter-data` sia il nome del volume Docker.

### Backup del database {#database-backup}

Utilizza il formato di archivio personalizzato di PostgreSQL e verifica l'archivio prima di considerare il backup completo:

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

Testare ogni backup ripristinandolo in uno stack isolato, controllando i record del database e i checksum dei file e avviando l'applicazione. `tests/qa/backup-restore-drill.sh` del repository automatizza il gate di rilascio rispetto a un `QA_IMAGE` esplicito.

Se invece la tua piattaforma esegue snapshot di volumi coerenti con gli arresti anomali, arresta prima l'intero stack e crea uno snapshot di tutti i volumi critici come un unico set. Una copia grezza della directory dati PostgreSQL da un contenitore in esecuzione non è un backup logico supportato.

### Backup di file e code {#file-and-queue-backup}

Mettere in pausa l'applicazione prima di acquisire file e volumi di coda. Utilizza `docker inspect` per risolvere il nome del volume effettivo, forzare Redis a mantenere il suo stato corrente e archiviare conservando proprietà e autorizzazioni:

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

Riavviare Redis prima dell'applicazione. Se escludi intenzionalmente `/data/ai`, rimuovi l'intero sottoalbero AI anziché preservare un record `installed.json` senza i relativi modelli o ambiente virtuale. Mantieni i file di backup crittografati, con accesso controllato e separati dall'host che esegue SnapOtter.

## Artefatti di conformità {#compliance-artifacts}

Ogni versione SnapOtter include i seguenti elementi di sicurezza:

| Artefatto | Formato | Dove trovarlo |
|---|---|---|
| Rilascia il soggetto vincolante | Attestazione canonica JSON + GitHub | Risorsa [Rilascio GitHub](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| Archivio SBOM | CycloneDX e SPDX JSON | Risorse di rilascio: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Immagine SBOM | CycloneDX e SPDX JSON | Risorse di rilascio: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Scansioni delle vulnerabilità | Trivy JSON | Rilascia risorse con prefissi `archive-linux-{arch}` o `image-linux-{arch}` corrispondenti |
| Scansione delle vulnerabilità | SARIF | Scheda [GitHub Sicurezza](https://github.com/snapotter-hq/SnapOtter/security). |
| Analisi statica | CodeQL (JS/TS + Python) | Scheda [GitHub Sicurezza](https://github.com/snapotter-hq/SnapOtter/security), eseguita settimanalmente + per PR |
| Revisione delle dipendenze | GitHub nativo | Il controllo per PR fallisce in caso di aggiunte con gravità elevata |
| Controllo delle dipendenze Python | pip-audit | Il registro di esecuzione CI viene eseguito a ogni push |
| Politica di sicurezza | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) nel repository |
| Aggiornamenti delle dipendenze | Dependabot | PR settimanali automatizzati per npm, pip, Docker, azioni |

**Esecuzione della tua scansione:**

Scarica il manifest dell'oggetto del rilascio e verifica che sia stato attestato dal flusso di lavoro del rilascio:

```bash
gh attestation verify snapotter-v2.2.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Il manifest registra `releaseTag`, `releaseCommit` e `workflowTriggerCommit` separatamente. Verifica che `releaseCommit` sia il commit estratto dal tag immutabile, quindi verifica il digest SHA-256 dell'archivio, dell'immagine, SBOM o esegui la scansione rispetto alla sua voce in `subjects`. Questa distinzione è intenzionale: l'estrazione di un commit di rilascio appena creato non modifica l'identità del commit nella credenziale OIDC del flusso di lavoro.

Puoi anche scansionare direttamente un SBOM scaricato o l'immagine:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.2.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.2.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.2.0
```

::: info
L'immagine SBOMs e le scansioni riflettono l'esatta immagine specifica dell'architettura pubblicata per quella versione. L'archivio SBOMs e le scansioni descrivono separatamente l'archivio precostruito. I bundle del modello AI installati dopo la distribuzione non sono inclusi in questi SBOMs perché vengono scaricati in fase di runtime.
:::
