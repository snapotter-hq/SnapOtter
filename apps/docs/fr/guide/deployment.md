---
description: Déployez SnapOtter en production avec Docker. Exigences matérielles, configuration du GPU et configurations de reverse proxy pour Nginx, Traefik et Cloudflare.
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: c6c1eae14599
---

# Déploiement {#deployment}

SnapOtter se déploie sous forme de stack Docker Compose à 3 conteneurs : l'image de l'application SnapOtter, PostgreSQL 17 et Redis 8. L'image de l'application prend en charge **linux/amd64** (avec NVIDIA CUDA pour l'accélération de l'IA) et **linux/arm64** (CPU), elle s'exécute donc nativement sur les serveurs Intel/AMD, les Mac Apple Silicon et les appareils ARM comme le Raspberry Pi 4/5. L'accélération par iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge aujourd'hui pour l'inférence IA.

Consultez [Image Docker](./docker-tags) pour la configuration du GPU, des exemples de Docker Compose et l'épinglage de version.

## Démarrage rapide (CPU) {#quick-start-cpu}

```yaml
# docker-compose.yml - Copy this file and run: docker compose up -d
services:
  SnapOtter:
    image: snapotter/snapotter:latest    # or ghcr.io/snapotter-hq/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - SnapOtter-data:/data           # AI models, user files (PERSISTENT)
      - SnapOtter-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

      # --- Database + Queue ---
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=true         # Trust X-Forwarded-For headers (set false if not behind a proxy)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"            # Needed for Python ML shared memory
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
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
    container_name: SnapOtter-redis
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
  SnapOtter-data:       # Named volume - Docker manages permissions automatically
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose up -d
```

L'application est ensuite disponible sur `http://localhost:1349`.

> **Limites de débit de Docker Hub ?** Remplacez `snapotter/snapotter:latest` par `ghcr.io/snapotter-hq/snapotter:latest` pour télécharger depuis GitHub Container Registry à la place. Les deux registres reçoivent la même image à chaque release.

## Démarrage rapide (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Pour l'accélération NVIDIA CUDA sur les outils d'IA (suppression d'arrière-plan, agrandissement, amélioration de visage, OCR) :

```yaml
# docker-compose-gpu.yml - Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"                # Required for PyTorch CUDA shared memory
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all           # Or set to 1 for a specific GPU
              capabilities: [gpu]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
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
    container_name: SnapOtter-redis
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

```bash
docker compose -f docker-compose-gpu.yml up -d
```

Vérifiez la détection de CUDA dans les logs :

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Exigences matérielles {#hardware-requirements}

Ces chiffres proviennent de benchmarks réalisés sur une gamme de systèmes, d'un poste de travail amd64 moderne équipé d'une NVIDIA RTX 4070 jusqu'à un Raspberry Pi, en exécutant l'ensemble du catalogue d'outils sur chacun et en balayant les limites de ressources Docker pour trouver le vrai plancher.

### Référence rapide {#quick-reference}

| Palier | Cas d'usage | CPU | RAM | GPU | Stockage |
|------|----------|-----|-----|-----|---------|
| Minimum | Outils d'image, de fichiers et PDF légers ; utilisateur unique ; petits lots | 2 cœurs | 2 Go | Aucun | ~7 Go |
| Recommandé | Les cinq modalités, y compris vidéo, PDF et IA sur CPU ; lots ; quelques utilisateurs | 4 cœurs | 4 Go | Aucun | ~25 Go |
| Complet | Tout à pleine vitesse, y compris l'IA sur GPU ; grands lots ; nombreux utilisateurs | 6-8 cœurs | 8 Go | NVIDIA 8 Go+ de VRAM (12 Go confortable) | ~35 Go |

**Architecture : 64 bits uniquement** (`linux/amd64` ou `linux/arm64`). SnapOtter s'exécute nativement sur les serveurs Intel/AMD, les Mac Apple Silicon et les cartes ARM 64 bits, y compris les **Raspberry Pi 4 et 5** (4-8 Go). Il ne s'exécute **pas** sur ARM 32 bits (`armv7`/`armhf`) — aucune image n'est construite pour cela — ni sur les cartes de la classe 512 Mo telles que le Pi Zero, qui sont en dessous du plancher mémoire (voir ci-dessous).

### Minimum (outils d'image, de fichiers et PDF légers ; sans IA) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Ressource | Exigence |
|---|---|
| CPU | 2 cœurs |
| RAM | 2 Go |
| Disque | ~5,5 Go (image) + volume de données |
| GPU | Non requis |

Les 222 outils du catalogue sans IA - image (redimensionner, rogner, convertir, compresser, ajuster, filigraner), vidéo (couper, mettre en sourdine, remultiplexer), audio (convertir, normaliser, couper), PDF (fusionner, diviser, compresser, faire pivoter, protéger), conversions de fichiers et préréglages de conversion dédiés - s'exécutent sur du matériel modeste. La plupart des opérations se terminent en bien moins d'une seconde, même sur un gros fichier : une image de 2,7 Mo se redimensionne en ~0,05 s et se réencode en WebP en ~2 s.

Le plancher mémoire est réel, d'après un balayage des limites de ressources Docker : **512 Mo ne peut pas démarrer la stack** (même un simple redimensionnement d'image est tué), **1 Go** gère les opérations sur un fichier unique mais un lot multi-fichiers manque de mémoire, et **2 Go / 2 cœurs** est la plus petite configuration qui gère les lots confortablement.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**La seule exception gourmande en CPU est le réencodage vidéo.** Les opérations par copie de flux (couper, mettre en sourdine, remultiplexage de conteneur) sont instantanées, mais le transcodage vers un codec différent est limité par le CPU. Un clip 1080p / 45 secondes réencodé en VP9 (WebM) prend environ **~40 s** sur un CPU moderne rapide, ~45 s sur Apple Silicon, ~80 s sur un ancien 4 cœurs mobile et **~130 s** sur un ancien serveur 4 cœurs. Si votre charge de travail est axée sur la vidéo, privilégiez les cœurs CPU et la fréquence d'horloge, ou augmentez la limite `cpus:` du conteneur — le compose fourni plafonne l'application à 4 cœurs par défaut (8 sur le compose GPU).

### Recommandé (outils d'IA sur CPU) {#recommended-ai-tools-on-cpu}

| Ressource | Exigence |
|---|---|
| CPU | 4 cœurs |
| RAM | 4 Go |
| Disque | 3 Go (image) + 24 Go (modèles d'IA) + espace de travail |
| GPU | Non requis (repli sur CPU) |

**C'est l'installation des bundles d'IA qui pousse la RAM à 4 Go.** Sans IA installée, l'application tourne au repos autour de 360 Mo ; avec les sept bundles installés, elle occupe ~2,6 Go résidents, car le sidecar d'IA Python précharge ses modèles (suppression d'arrière-plan, agrandissement, OCR, transcription, détection de visage, restauration) au démarrage. Les installations sans IA restent légères ; les installations avec IA nécessitent ≥4 Go.

La plupart des outils d'IA sont parfaitement utilisables sur CPU ; deux d'entre eux ont vraiment besoin d'un GPU. Mesuré sur un CPU 4 cœurs moderne :

| Outil d'IA | Temps CPU | Utilisable sur CPU ? |
|---|---|---|
| Détection de visage (blur-faces, smart-crop, red-eye), noise-removal | moins de 1 s | Oui |
| OCR, transcription, sous-titres | 1-3 s | Oui |
| Colorize, amélioration de visage | ~10 s | Oui |
| Suppression / remplacement / flou d'arrière-plan | ~29 s | Oui (il faudra patienter) |
| Agrandissement IA (RealESRGAN) | ~33 s en petit ; minutes sur les grandes images | Limite — GPU fortement recommandé |
| Restauration de photo (pipeline complet) | plusieurs minutes | Non — nécessite un GPU ou un CPU rapide à nombreux cœurs |

Tailles de téléchargement des modèles d'IA :

| Bundle | Taille sur le disque |
|---|---|
| Suppression d'arrière-plan | 4-5 Go |
| Agrandissement + Amélioration de visage + Suppression de bruit | 5-6 Go |
| Détection de visage | 200-300 Mo |
| Gomme d'objets + Colorize | 1-2 Go |
| OCR | 5-6 Go |
| Restauration de photo | 4-5 Go |
| **Tous les bundles** | **~24 Go** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Complet (outils d'IA sur NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Ressource | Exigence |
|---|---|
| CPU | 6-8 cœurs (la préparation vidéo + la concurrence s'exécutent sur CPU même avec l'IA sur GPU) |
| RAM | 8 Go |
| GPU | NVIDIA avec 8+ Go de VRAM (12 Go recommandé) |
| Disque | ~35 Go au total |

Un GPU NVIDIA (CUDA) accélère considérablement les modèles d'IA lourds. Mesuré sur une RTX 4070 vs un CPU moderne :

| Outil d'IA | Accélération avec GPU | Notes |
|---|---|---|
| Agrandissement IA (RealESRGAN 2×) | **~47×** | Le plus gros gain — moins d'une seconde vs ~33 s (minutes sur les grandes images) |
| Amélioration de visage (CodeFormer) | **~12×** | ~0,9 s vs ~11 s |
| Transcription (Whisper) | ~4,5× | |
| Suppression / remplacement / flou d'arrière-plan | ~4× | ~7 s sur GPU vs ~29 s sur CPU |
| Colorize | ~1,8× | |
| OCR, détection de visage, red-eye, noise-removal | ~1× | Déjà rapide sur CPU — un GPU n'aide pas |
| Restauration de photo | aucune | Limité par le CPU même sur un GPU (0 % d'utilisation du GPU) ; un CPU rapide compte plus qu'un GPU ici |

Les outils qui valent un GPU sont **l'agrandissement, l'amélioration de visage, la transcription et la suppression d'arrière-plan**. La détection de visage, l'OCR et le red-eye sont limités par le CPU et déjà rapides, donc un GPU n'apporte rien.

L'utilisation maximale de VRAM atteint 7,5 Go pendant l'agrandissement avec amélioration de visage. Un GPU NVIDIA de 6 Go fonctionne pour la plupart des outils d'IA individuellement, mais échouera sur l'agrandissement. 8-12 Go de VRAM gèrent tout.

L'accélération par iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge aujourd'hui pour l'inférence IA. Mapper `/dev/dri` dans le conteneur n'active pas l'accélération GPU de l'IA ; SnapOtter exécutera les outils d'IA sur CPU à moins que NVIDIA CUDA ne soit disponible.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### Utilisateurs simultanés {#concurrent-users}

Requêtes de redimensionnement d'image en parallèle contre le conteneur d'application plafonné par défaut à 4 cœurs :

| Requêtes simultanées | Temps de réponse moyen | Erreurs |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

Le temps de réponse se dégrade de façon sous-linéaire sans erreurs à mesure que le pool de workers sature. Augmenter la limite `cpus:` du conteneur d'application (ou utiliser un hôte avec plus de cœurs) relève le plafond. Notez que les tâches lourdes (transcodage vidéo, IA sur CPU) monopolisent un worker pendant toute leur durée, donc dimensionnez le CPU selon votre nombre attendu de tâches lourdes simultanées, et pas seulement selon le nombre de requêtes.

### Formats d'image pris en charge {#supported-image-formats}

SnapOtter prend en charge **plus de 55 formats d'entrée** et **14 formats de sortie**, y compris les fichiers RAW de plus de 20 marques d'appareils photo, les formats professionnels (PSD, EPS, OpenEXR, HDR), les codecs modernes (JPEG XL, AVIF, HEIC, QOI) et les formats scientifiques/de jeu (FITS, DDS).

Consultez la [liste complète des formats](/fr/guide/supported-formats) pour les détails sur chaque format pris en charge, le décodeur utilisé et les contrôles de qualité disponibles.

### Limitations connues {#known-limitations}

- **Le redimensionnement adaptatif au contenu** plante sur les grandes images (>5 MP) en raison d'une limitation du binaire caire. Fonctionne bien avec des images plus petites.
- **Le décodage HEIF** prend 13-23 secondes. Le HEIC (la variante d'Apple) est beaucoup plus rapide à 0,3-0,9 seconde.
- **L'OCR japonais** échoue sur CPU à cause d'un bug MKLDNN de PaddlePaddle. Fonctionne sur GPU.
- **L'agrandissement** expire sur CPU pour tout ce qui dépasse les petites images. GPU requis pour un usage pratique.
- **L'amélioration de visage CodeFormer** est nettement plus lente que GFPGAN (53 s vs 2 s sur GPU). GFPGAN est recommandé pour la plupart des cas d'usage.

## Volumes {#volumes}

| Montage / Volume | Objet | Requis ? |
|---|---|---|
| `/data` (app) | Modèles d'IA, venv Python, fichiers utilisateurs | **Oui** - perte de fichiers sans lui |
| `/tmp/workspace` (app) | Fichiers de traitement temporaires (nettoyés automatiquement) | Recommandé |
| `SnapOtter-pgdata` (postgres) | Répertoire de données PostgreSQL (utilisateurs, paramètres, pipelines, tâches) | **Oui** - perte de données sans lui |
| `SnapOtter-redisdata` (redis) | Fichier append-only de Redis pour des files de tâches durables | Recommandé |

### Bind mounts vs volumes nommés {#bind-mounts-vs-named-volumes}

**Volumes nommés** (recommandé) — Docker gère les permissions automatiquement :
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts** — Vous gérez les permissions. Définissez `PUID`/`PGID` pour correspondre à votre utilisateur hôte :
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Permissions de stockage {#storage-permissions}

SnapOtter écrit à deux emplacements à l'exécution : `/data` (fichiers utilisateurs, logs, modèles d'IA et venv Python) et `/tmp/workspace` (espace de travail temporaire de traitement). Les deux doivent être accessibles en écriture par l'utilisateur sous lequel s'exécute le conteneur. Si l'un ou l'autre ne l'est pas, le conteneur **échoue rapidement au démarrage** avec un message nommant le répertoire, l'UID/GID en cours d'exécution et la façon de corriger le problème — au lieu de démarrer « en bonne santé » puis d'échouer au premier envoi avec une erreur cryptique.

La manière dont les permissions sont gérées dépend de la façon dont le conteneur est lancé :

**Par défaut (démarre en root, se rabaisse à `snapotter`)** — le point d'entrée démarre en root, corrige la propriété des volumes montés, puis se rabaisse à l'utilisateur non privilégié `snapotter` via `gosu`. Les volumes nommés fonctionnent sans configuration. Pour les bind mounts, définissez `PUID`/`PGID` sur votre utilisateur hôte (ci-dessus) afin que les fichiers qu'il écrit vous appartiennent.

**Kubernetes / OpenShift (non-root via `runAsUser`)** — lancé directement en tant qu'utilisateur non-root, le conteneur ne peut pas chown les volumes lui-même, l'orchestrateur doit donc les rendre accessibles en écriture. Définissez `fsGroup` :

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Les répertoires accessibles en écriture de l'image appartiennent au groupe GID 0 et sont accessibles en écriture par le groupe, de sorte qu'un pod s'exécutant avec un **UID arbitraire** plus le groupe supplémentaire root (la valeur par défaut d'OpenShift) peut écrire sans `chown`.

**TrueNAS Scale (et autres configurations à « UID étranger »)** — TrueNAS exécute les applications en tant qu'utilisateur non-root (souvent `568:568`) et monte des jeux de données hôte appartenant à un utilisateur différent, de sorte que ni le point d'entrée ni `fsGroup` ne les rendent accessibles en écriture par lui-même. Choisissez l'une des options :

- **Exécuter l'application en root** (recommandé) — laissez l'utilisateur de l'application non défini ou définissez-le sur `0`, et laissez le point d'entrée par défaut corriger les permissions et se rabaisser à `snapotter`.
- **Exécuter en UID `999`** — définissez l'utilisateur/groupe de l'application sur `999:999` (l'utilisateur `snapotter` intégré de SnapOtter) afin qu'il corresponde à la propriété de l'image.
- **`chown` le jeu de données hôte** vers l'UID sous lequel s'exécute le conteneur, depuis le shell TrueNAS :

  ```bash
  # Utilisez l'UID de l'erreur de démarrage (ou exécutez `id` à l'intérieur du conteneur)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

L'erreur de démarrage nomme l'UID exact à utiliser, donc le chemin le plus rapide est de démarrer l'application une fois, de lire le message, puis de `chown` (ou d'ajuster l'utilisateur) en conséquence.

## Variables d'environnement {#environment-variables}

| Variable | Par défaut | Description |
|---|---|---|
| `AUTH_ENABLED` | `true` | Activer/désactiver l'exigence de connexion |
| `DEFAULT_USERNAME` | `admin` | Nom d'utilisateur admin initial |
| `DEFAULT_PASSWORD` | `admin` | Mot de passe admin initial (changement forcé à la première connexion) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Limite d'envoi par fichier |
| `MAX_BATCH_SIZE` | `100` | Nombre max de fichiers par requête de lot |
| `RATE_LIMIT_PER_MIN` | `1000` | Requêtes API par minute par IP (mettez 0 pour désactiver) |
| `MAX_USERS` | `0` (illimité) | Nombre maximal de comptes utilisateurs |
| `TRUST_PROXY` | `true` | Faire confiance aux en-têtes X-Forwarded-For du reverse proxy |
| `PUID` | `999` | S'exécuter sous cet UID (pour les permissions des bind mounts) |
| `PGID` | `999` | S'exécuter sous ce GID (pour les permissions des bind mounts) |
| `LOG_LEVEL` | `info` | Verbosité des logs : fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Nombre max de tâches de traitement IA en parallèle |
| `SESSION_DURATION_HOURS` | `168` | Durée de vie de la session de connexion (7 jours) |
| `CORS_ORIGIN` | (vide) | Origines autorisées séparées par des virgules, ou vide pour la même origine |

## Vérification de santé {#health-check}

Le conteneur inclut une vérification de santé intégrée :

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse proxy {#reverse-proxy}

SnapOtter définit `TRUST_PROXY=true` par défaut afin que la limitation de débit et la journalisation utilisent la véritable IP client provenant des en-têtes `X-Forwarded-For`.

### Nginx {#nginx}

```nginx
server {
    listen 80;
    server_name images.example.com;

    # Match MAX_UPLOAD_SIZE_MB (0 = nginx default 1M, so set high for unlimited)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1349;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support (batch progress, feature install progress)
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Ajoutez un nouveau Proxy Host
2. Définissez le nom de domaine sur votre domaine
3. Définissez le schéma sur `http`, le nom d'hôte de transfert sur `SnapOtter` (ou l'IP de votre conteneur), le port de transfert sur `1349`
4. Activez la prise en charge de WebSocket
5. Sous Advanced, ajoutez : `client_max_body_size 500M;` et `proxy_buffering off;`

### Traefik {#traefik}

```yaml
# Add these labels to the SnapOtter service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.snapotter.rule=Host(`images.example.com`)"
  - "traefik.http.routers.snapotter.entrypoints=websecure"
  - "traefik.http.routers.snapotter.tls.certresolver=letsencrypt"
  - "traefik.http.services.snapotter.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.snapotter-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.snapotter.middlewares=snapotter-body"
```

### Caddy {#caddy}

```txt
images.example.com {
    reverse_proxy localhost:1349 {
        flush_interval -1
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

`flush_interval -1` désactive la mise en tampon des réponses, ce qui est requis pour les événements de progression SSE (traitement par lots, outils d'IA, installations de fonctionnalités). Les délais d'attente étendus permettent aux envois de gros fichiers de se terminer sans que Caddy ne ferme la connexion prématurément.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Note : Cloudflare a une limite d'envoi de 100 Mo sur les plans gratuits. Définissez `MAX_UPLOAD_SIZE_MB=100` pour correspondre.

## CI/CD {#ci-cd}

Le dépôt GitHub comporte trois workflows :

- **ci.yml** - S'exécute automatiquement à chaque push et PR. Lint, vérification de types, tests, build et validation de l'image Docker (sans push).
- **release.yml** - Déclenché manuellement via `workflow_dispatch`. Exécute semantic-release pour créer un tag de version et une release GitHub, puis construit une image Docker multi-arch (amd64 + arm64) et la pousse vers Docker Hub (`snapotter/snapotter`) et GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Construit ce site de documentation et le déploie sur Cloudflare Pages lors d'un push vers `main`.

Pour créer une release, allez dans **Actions > Release > Run workflow** dans l'interface GitHub, ou exécutez :

```bash
gh workflow run release.yml
```

Semantic-release détermine la version à partir de l'historique des commits. Le tag Docker `latest` pointe toujours vers la release la plus récente.

## Analytics {#analytics}

SnapOtter inclut des analytics produit anonymes (schémas d'utilisation des outils, rapports d'erreurs) pour aider à détecter les bugs et améliorer les fonctionnalités. Elles sont activées par défaut. Vos fichiers, noms de fichiers et données personnelles n'en font jamais partie. SnapOtter fonctionne normalement avec les analytics désactivées.

### Désactiver les analytics {#disabling-analytics}

Le désengagement à l'exécution est un bouton admin en un clic. Ouvrez Settings > System > Privacy et désactivez Anonymous Product Analytics. Cela s'arrête immédiatement pour toute l'instance, sans reconstruction requise.

Pour une image qui ne peut jamais émettre d'analytics, définissez le désengagement dur au moment du build en clonant le dépôt et en reconstruisant :

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Ou ajoutez l'argument de build à votre `docker-compose.yml` existant :

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
