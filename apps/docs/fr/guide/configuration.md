---
description: "Toutes les variables d'environnement de SnapOtter avec leurs valeurs par défaut. Configurez l'authentification, le stockage, les modèles d'IA, l'analytique et plus encore."
i18n_source_hash: 25970c776f7c
i18n_provenance: human
i18n_output_hash: 0ec4810b79da
i18n_hash_version: 2
---

# Configuration {#configuration}

Toute la configuration se fait via des variables d'environnement. Chaque variable possède une valeur par défaut raisonnable, de sorte que SnapOtter fonctionne d'emblée sans qu'aucune d'elles ne soit définie.

## Variables d'environnement {#environment-variables}

### Serveur {#server}

| Variable | Par défaut | Description |
|---|---|---|
| `PORT` | `1349` | Port sur lequel le serveur écoute. |
| `RATE_LIMIT_PER_MIN` | `1000` | Nombre maximal de requêtes par minute par IP. Mettez 0 pour désactiver la limitation de débit. |
| `CORS_ORIGIN` | (vide) | Origines autorisées pour le CORS, séparées par des virgules, ou vide pour la même origine uniquement. |
| `LOG_LEVEL` | `info` | Verbosité des journaux. L'une des valeurs : `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Quels pairs peuvent définir l'IP du client via `X-Forwarded-For`. La valeur par défaut ne croit qu'un pair d'un réseau privé : un reverse proxy sur un réseau Docker ou sur un LAN est donc digne de confiance, alors que l'en-tête falsifié d'un client public ne l'est pas. Ne mettez `true` que lorsqu'un proxy que vous contrôlez se trouve devant, sur une adresse publique. |

### Authentification {#authentication}

Les deux booléens ci-dessous n'acceptent que `true` et `false`. Toute autre valeur, `1`, `yes` ou `on`, échoue à la validation et le serveur s'arrête avant de commencer à écouter.

| Variable | Par défaut | Description |
|---|---|---|
| `AUTH_ENABLED` | `true` | Exige une connexion. Mettez `false` pour fonctionner sans aucun compte, ce qui accorde les droits admin à chaque requête ; réservez donc cela à un réseau de confiance. |
| `DEFAULT_USERNAME` | `admin` | Nom d'utilisateur du compte admin initial. Utilisé uniquement au premier lancement. |
| `DEFAULT_PASSWORD` | `admin` | Mot de passe du compte admin initial. Changez-le après la première connexion. |
| `MAX_USERS` | `0` (illimité) | Nombre maximal de comptes utilisateur enregistrés. Mettez 0 pour illimité. |
| `SESSION_DURATION_HOURS` | `168` | Durée de vie de la session de connexion en heures (par défaut 7 jours). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Mettez `true` pour ignorer l'invite de changement de mot de passe forcé à la première connexion. |

### Stockage {#storage}

| Variable | Par défaut | Description |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` ou `s3`. S3 et MinIO nécessitent une licence avec la fonctionnalité s3_storage, ainsi que les variables `S3_*` ci-dessous. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | Chaîne de connexion PostgreSQL. La pile Compose la pointe vers son service `postgres` ; laissez-la non définie (avec `REDIS_URL`) pour obtenir le mode intégré. |
| `REDIS_URL` | `redis://localhost:6379` | Chaîne de connexion Redis (utilisée pour les files d'attente de tâches BullMQ). Compose la pointe vers son service `redis`. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Répertoire des fichiers temporaires pendant le traitement. Nettoyé automatiquement. L'image définit `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Répertoire des fichiers utilisateur persistants (images téléversées, résultats enregistrés). L'image définit `/data/files`. |

### Stockage d'objets S3 {#s3-object-storage}

Lues uniquement lorsque `STORAGE_MODE=s3`. S'il manque l'une des trois variables obligatoires, le démarrage échoue en indiquant le nom de celle que vous avez oubliée.

| Variable | Par défaut | Description |
|---|---|---|
| `S3_BUCKET` | (vide) | Bucket qui contient les téléversements et les sorties. Obligatoire. |
| `S3_ACCESS_KEY_ID` | (vide) | Clé d'accès. Obligatoire. Dans le conteneur, vous pouvez plutôt la monter, via `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (vide) | Clé secrète. Obligatoire. Même convention de fichier : `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Région du bucket. |
| `S3_ENDPOINT` | (vide) | Point de terminaison personnalisé pour MinIO, R2, Backblaze et les autres stockages compatibles S3. Vide signifie AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Mettez `true` pour MinIO et tout autre service qui attend `endpoint/bucket/key` plutôt qu'un adressage par hôte virtuel. |
| `S3_PREFIX` | (vide) | Préfixe de clé, pour qu'un même bucket puisse héberger plusieurs instances. |

### Chiffrement au repos {#encryption-at-rest}

| Variable | Par défaut | Description |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (vide) | 64 caractères hexadécimaux (32 octets). Chiffre les paramètres sensibles stockés dans la base de données. Tout ce qui ne fait pas exactement 64 caractères hexadécimaux est rejeté au démarrage. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (vide) | La clé que vous abandonnez lors d'une rotation, au même format. Définissez les deux pendant la rotation pour que les lignes existantes restent déchiffrables, puis retirez celle-ci. |

### Mode intégré {#embedded-mode}

Exécutez l'image sans `DATABASE_URL` et sans `REDIS_URL` et elle démarre ses propres PostgreSQL 17 et Redis à l'intérieur du conteneur, liés au loopback, avec toutes les données sur le volume `/data`. Cela restaure l'expérience `docker run` en une seule commande pour un démarrage rapide, un homelab et les mises à niveau depuis la version 1.x. C'est un chemin de commodité, pas un déploiement de production : pour la production, exécutez la pile Compose à 3 conteneurs avec PostgreSQL et Redis séparés. Le mode intégré nécessite d'exécuter le conteneur en tant que root et est incompatible avec les runtimes à UID arbitraire (OpenShift, Kubernetes `runAsNonRoot`) ; utilisez Compose dans ce cas.

| Variable | Par défaut | Description |
|---|---|---|
| `EMBEDDED` | `auto` | Activé automatiquement lorsque `DATABASE_URL` et `REDIS_URL` sont tous deux non définis. Mettez `0` pour le désactiver (l'application échoue alors immédiatement si aucun `DATABASE_URL`/`REDIS_URL` externe n'est défini, plutôt que de démarrer silencieusement une base de données dans le conteneur). |
| `REDIS_MAXMEMORY` | `512mb` | Plafond mémoire du Redis intégré (mode intégré uniquement). Abaissez-le sur les hôtes à mémoire limitée tels qu'un Raspberry Pi. |

Mise à niveau depuis la version 1.x : placez votre ancien `snapotter.db` à `/data/snapotter.db` dans le volume et le mode intégré l'importe dans le PostgreSQL intégré au premier démarrage. L'import s'exécute une fois ; les démarrages suivants l'ignorent.

Note sur la télémétrie : le mode intégré hérite de la valeur d'analytique par défaut de l'image comme toute autre configuration. L'image publiée est livrée avec l'analytique activée ; compilez avec `--build-arg SNAPOTTER_ANALYTICS=off`, ou utilisez la désactivation admin intégrée à l'application, pour la désactiver.

### Limites de traitement {#processing-limits}

| Variable | Par défaut | Description |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (illimité) | Taille maximale de fichier par téléversement en mégaoctets. Mettez 0 pour illimité. L'image publiée est livrée avec `0` ; une compilation depuis les sources démarre à 100. |
| `MAX_BATCH_SIZE` | `0` (illimité) | Nombre maximal de fichiers dans une seule requête par lots. Mettez 0 pour illimité. L'image publiée est livrée avec `0` ; une compilation depuis les sources démarre à 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Nombre de tâches par lots exécutées en parallèle. Mettez 0 pour détecter automatiquement selon les cœurs CPU disponibles. |
| `MAX_MEGAPIXELS` | `0` (illimité) | Résolution d'image maximale autorisée en mégapixels. Mettez 0 pour illimité. |
| `MAX_WORKER_THREADS` | `0` (auto) | Nombre maximal de threads de travail pour le traitement d'images. Mettez 0 pour détecter automatiquement selon les cœurs CPU disponibles. |
| `PROCESSING_TIMEOUT_S` | `0` (aucune limite) | Temps de traitement maximal par requête en secondes. Mettez 0 pour aucun délai d'expiration. |
| `MAX_PIPELINE_STEPS` | `20` | Nombre maximal d'étapes dans un pipeline. Mettez 0 pour aucune limite. |
| `MAX_CANVAS_PIXELS` | `0` (aucune limite) | Taille de canevas maximale en pixels pour les images de sortie. Mettez 0 pour aucune limite. |
| `MAX_SVG_SIZE_MB` | `50` | Plus grand SVG accepté avant l'assainissement, en mégaoctets. Ici, `0` se comporte différemment des lignes voisines. Il supprime entièrement le plafond de taille appliqué avant l'analyse au lieu de le relever, laissez donc cette valeur définie. |
| `MAX_PDF_PAGES` | `0` (illimité) | Nombre maximal de pages PDF pour la conversion PDF-vers-image. Mettez 0 pour illimité. |

### Nettoyage {#cleanup}

| Variable | Par défaut | Description |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Durée de conservation des résultats de traitement non enregistrés (téléversements bruts et sorties d'outils) avant suppression automatique. Les fichiers que vous enregistrez explicitement dans la bibliothèque Fichiers ne sont pas affectés et persistent jusqu'à ce que vous les supprimiez. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Fréquence d'exécution de la tâche de nettoyage. |

### Apparence {#appearance}

| Variable | Par défaut | Description |
|---|---|---|
| `DEFAULT_THEME` | `light` | Thème par défaut pour les nouvelles sessions. `light`, `dark` ou `system`. |
| `DEFAULT_LOCALE` | `en` | Langue d'interface par défaut. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Disposition d'outil par défaut. `sidebar` ou `fullscreen`. |

### Permissions Docker {#docker-permissions}

| Variable | Par défaut | Description |
|---|---|---|
| `PUID` | `999` | Exécuter le processus du conteneur sous cet UID. Réglez-le pour correspondre à votre utilisateur hôte pour les bind mounts (`id -u`). |
| `PGID` | `999` | Exécuter le processus du conteneur sous ce GID. Réglez-le pour correspondre à votre groupe hôte pour les bind mounts (`id -g`). |

## Exemple Docker {#docker-example}

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
      POSTGRES_PASSWORD: snapotter     # Changez ceci pour les déploiements non locaux
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

## Volumes {#volumes}

La pile Docker Compose utilise quatre volumes :

- `/data` (app) - Modèles d'IA, environnement virtuel Python et fichiers utilisateur. Montez-le pour conserver les fichiers téléversés et les modules d'IA installés entre les redémarrages.
- `/tmp/workspace` (app) - Stockage temporaire des fichiers en cours de traitement. Il peut être éphémère, mais le monter évite de remplir la couche accessible en écriture du conteneur.
- `SnapOtter-pgdata` (postgres) - Répertoire de données de PostgreSQL. Il contient toutes les données relationnelles (utilisateurs, paramètres, pipelines, tâches, journal d'audit). Sauvegardez-le via `pg_dump` ou un instantané de volume.
- `SnapOtter-redisdata` (redis) - Fichier en écriture seule de Redis pour des files d'attente de tâches durables.
