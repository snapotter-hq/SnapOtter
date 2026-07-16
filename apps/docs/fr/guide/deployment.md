---
description: "Déployez SnapOtter en production avec Docker. Exigences matérielles, configuration GPU et configs de reverse proxy pour Nginx, Traefik et Cloudflare."
i18n_output_hash: 61b221ad6255
i18n_source_hash: 98172965118b
i18n_provenance: human
---

# Déploiement {#deployment}

SnapOtter se déploie sous la forme d'une pile Docker Compose à 3 conteneurs : l'image applicative SnapOtter, PostgreSQL 17 et Redis 8. L'image applicative prend en charge **linux/amd64** (avec NVIDIA CUDA pour l'accélération de l'IA) et **linux/arm64** (CPU), elle s'exécute donc nativement sur les serveurs Intel/AMD, les Mac Apple Silicon et les appareils ARM comme le Raspberry Pi 4/5. L'accélération par iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge pour l'inférence IA aujourd'hui.

Consultez [Image Docker](./docker-tags) pour la configuration GPU, les exemples Docker Compose et l'épinglage de version.


<!-- korean-ocr-contract:start -->
::: info Compatibilité de l’OCR coréen
L’OCR rapide prend en charge `auto`, `en`, `de`, `es`, `fr`, `zh` et `ja`, mais pas le coréen (`ko`). Le coréen nécessite le pack OCR précis et `balanced` ou `best`. Le pack fonctionne dans les conteneurs Linux amd64 et arm64 officiels, y compris sur les hôtes NVIDIA où l’OCR reste exécuté sur le CPU. Un système non pris en charge reçoit une erreur de compatibilité explicite, sans repli silencieux vers `fast`. Le coréen avec `fast` ou l’alias historique `tesseract` est refusé avant la mise en file avec `FEATURE_INCOMPATIBLE` et `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
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

> **Limites de débit Docker Hub ?** Remplacez `snapotter/snapotter:latest` par `ghcr.io/snapotter-hq/snapotter:latest` pour récupérer l'image depuis GitHub Container Registry à la place. Les deux registres reçoivent la même image à chaque publication.

## Démarrage rapide (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Pour l’accélération NVIDIA CUDA sur les outils d’IA pris en charge (suppression de l’arrière-plan, mise à l’échelle, amélioration du visage) :

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

Vérifiez la détection de CUDA dans les journaux :

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Exigences matérielles {#hardware-requirements}

Ces chiffres proviennent de tests de performance sur toute une gamme de systèmes, d'un poste de travail amd64 moderne équipé d'une NVIDIA RTX 4070 jusqu'à un Raspberry Pi, en exécutant l'intégralité du catalogue d'outils sur chacun et en balayant les limites de ressources Docker pour trouver le plancher réel.

Vous tournez au bas de ces niveaux (un Pi, un vieux portable, un VPS de 2 Go) ? [Configurations à ressources limitées](/fr/guide/low-resource) transforme ces chiffres en un pas à pas concret avec des plafonds ajustés.

### Référence rapide {#quick-reference}

| Niveau | Cas d'usage | CPU | RAM | GPU | Stockage |
|------|----------|-----|-----|-----|---------|
| Minimum | Outils image, fichiers et PDF légers ; utilisateur unique ; petits lots | 2 cœurs | 2 Go | Aucun | ~7 Go |
| Recommandé | Les cinq modalités, y compris vidéo, PDF et IA sur CPU ; lots ; quelques utilisateurs | 4 cœurs | 4 Go | Aucun | ~25 Go |
| Complet | Tout à pleine vitesse, y compris IA sur GPU ; grands lots ; nombreux utilisateurs | 6-8 cœurs | 8 Go | NVIDIA 8 Go+ de VRAM (12 Go confortable) | ~35 Go |

**Architecture : 64 bits uniquement** (`linux/amd64` ou `linux/arm64`). SnapOtter s'exécute nativement sur les serveurs Intel/AMD, les Mac Apple Silicon et les cartes ARM 64 bits, y compris le **Raspberry Pi 4 et 5** (4-8 Go). Il **ne** fonctionne **pas** sur ARM 32 bits (`armv7`/`armhf`), aucune image n'étant construite pour cette cible, ni sur les cartes de la classe 512 Mo comme le Pi Zero, qui sont sous le plancher mémoire (voir ci-dessous).

### Minimum (outils image, fichiers et PDF légers ; sans IA) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Ressource | Exigence |
|---|---|
| CPU | 2 cœurs |
| RAM | 2 Go |
| Disque | ~5,5 Go (image) + volume de données |
| GPU | Non requis |

Les 222 outils non-IA du catalogue - image (redimensionner, rogner, convertir, compresser, ajuster, filigraner), vidéo (couper, rendre muet, remultiplexer), audio (convertir, normaliser, couper), PDF (fusionner, diviser, compresser, pivoter, protéger), conversions de fichiers et préréglages de conversion dédiés - s'exécutent sur du matériel modeste. La plupart des opérations se terminent en bien moins d'une seconde, même sur un gros fichier : une image de 2,7 Mo est redimensionnée en ~0,05 s et réencodée en WebP en ~2 s.

Le plancher mémoire est réel, d'après un balayage des limites de ressources Docker : **512 Mo ne peuvent pas démarrer la pile** (même un simple redimensionnement d'image est tué), **1 Go** gère les opérations sur un seul fichier mais un lot multi-fichiers manque de mémoire, et **2 Go / 2 cœurs** est la plus petite configuration qui gère les lots confortablement.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**La seule exception gourmande en CPU est le réencodage vidéo.** Les opérations de copie de flux (couper, rendre muet, remultiplexage de conteneur) sont instantanées, mais le transcodage vers un codec différent est limité par le CPU. Un clip 1080p / 45 secondes réencodé en VP9 (WebM) prend environ **~40 s** sur un CPU moderne rapide, ~45 s sur Apple Silicon, ~80 s sur un ancien 4 cœurs mobile et **~130 s** sur un ancien serveur 4 cœurs. Si votre charge de travail est axée sur la vidéo, privilégiez les cœurs CPU et la fréquence d'horloge, ou augmentez la limite `cpus:` du conteneur : le compose fourni plafonne l'application à 4 cœurs par défaut (8 sur le compose GPU).

### Recommandé (outils IA sur CPU) {#recommended-ai-tools-on-cpu}

| Ressource | Exigence |
|---|---|
| CPU | 4 cœurs |
| RAM | 4 Go |
| Disk | 3 Go (image) + environ 20 Go (tous les packs AI en option) + espace de travail |
| GPU | Non requis (repli sur CPU) |

**L'installation et l'exécution des plus gros bundles d'IA sont ce qui pousse la recommandation à 4 Go de RAM.** Sans packs optionnels installés, l'application reste inactive autour de 360 ​​Mo. Les anciens outils Python partagent un sidecar, tandis que les outils OCR précis utilisent un dispatcher dédié à longue durée de vie épinglé à la génération active immuable. Avant l'activation, le programme d'installation exécute un smoke test sur le candidat. Il passe ensuite de manière atomique au nouveau dispatcher et draine le dispatcher précédent avant garbage collection. Chaque artefact OCR précis officiel doit transmettre son release suite le plus défavorable dans un 4 GiB cgroup, tandis que la recommandation d'hôte de 4 Go laisse une marge pour l'application Node.js, Postgres, Redis, les files d'attente et le travail simultané.

La plupart des outils IA sont parfaitement utilisables sur CPU ; deux ou trois veulent vraiment un GPU. Mesuré sur un CPU 4 cœurs moderne :

| Outil IA | Temps CPU | Utilisable sur CPU ? |
|---|---|---|
| Détection de visages (flouter les visages, recadrage intelligent, yeux rouges), suppression du bruit | moins de 1 s | Oui |
| OCR, transcription, sous-titres | 1-3 s | Oui |
| Coloriser, amélioration des visages | ~10 s | Oui |
| Suppression / remplacement / floutage d'arrière-plan | ~29 s | Oui (il faudra patienter) |
| Agrandissement IA (RealESRGAN) | ~33 s sur petit format ; plusieurs minutes sur les grandes images | Limite - GPU fortement recommandé |
| Restauration de photo (pipeline complet) | plusieurs minutes | Non - nécessite un GPU ou un CPU rapide à nombreux cœurs |

SnapOtter n'intègre volontairement pas ces téléchargements de modèles dans l'image Docker. Les bundles IA ne sont récupérés que lorsqu'un administrateur active l'outil concerné, stockés dans le volume persistant `/data/ai` et partagés par chaque outil qui dépend de la même pile de modèles. Cela maintient l'image finale du conteneur petite tout en permettant à une installation IA complète d'atteindre les chiffres de stockage plus élevés ci-dessous.

Certains outils dépendent de plus d'un bundle partagé. Par exemple, Photo d'identité a besoin à la fois de `background-removal` et de `face-detection` ; si `background-removal` est déjà installé, activer Photo d'identité ne télécharge que le bundle `face-detection` manquant. La même réutilisation s'applique à tous les outils IA.

Estimations de stockage du pack AI en option :

| Bundle | Taille disque |
|---|---|
| Suppression d'arrière-plan | 4-5 Go |
| Agrandissement + Amélioration des visages + Suppression du bruit | 5-6 Go |
| Détection de visages | 200-300 Mo |
| Gomme d'objets + Coloriser | 1-2 Go |
| OCR précis (`balanced`/`best`) | ~208-234 MiB téléchargé / ~409-488 MiB installé |
| Restauration de photo | 4-5 Go |
| Transcription | ~600 Mo |
| **Tous les forfaits** | **~20 Go installés** |

Fast OCR est intégré à l'image via Tesseract, ajoute environ 25 MiB et ne nécessite pas le pack OCR en option ni ses 4 exigences de mémoire GiB. Le pack précis est disponible dans les conteneurs officiels Linux amd64 et arm64 et exécute ONNX Runtime sur CPU. Les hôtes NVIDIA utilisent le même environnement d'exécution CPU OCR, donc OCR ne dépend pas de la version CUDA ou de l'architecture GPU. Le temps d'exécution précis nécessite au moins 4 GiB de mémoire effective : la limite cgroup du conteneur configuré, sinon la mémoire hôte. SnapOtter rejette les systèmes inférieurs au minimum de compatibilité signé avant de télécharger le pack. L'installation d'un pack précis est également rejetée sur les archives bare-metal/préconstruites dont les libc et Python ABI ne peuvent pas être garanties.

Les répliques qui partagent le même `DATA_DIR` doivent utiliser la même architecture de processeur ; épinglez les déploiements à plusieurs répliques à des nœuds compatibles au moyen de l'affinité de nœuds. Les répliques amd64/arm64 mixtes nécessitent des volumes de données distincts et des déploiements SnapOtter indépendants.

Le runtime précis conserve une génération active et purge son cache de téléchargement après l'activation. Pour cette version, une première installation nécessite temporairement environ 620-720 MiB pour l'archive plus le staging, et une mise à niveau peut culminer près de 1,2 GiB tandis que l'ancienne génération reste active. Le programme d'installation calcule les exigences exactes à partir de l'index signé et des générations actuelles avant le téléchargement ou l'extraction, et échoue prématurément si le volume de données est trop petit.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Complet (outils IA sur NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Ressource | Exigence |
|---|---|
| CPU | 6-8 cœurs (la préparation vidéo + la concurrence s'exécutent sur CPU même avec l'IA sur GPU) |
| RAM | 8 Go |
| GPU | NVIDIA avec 8+ Go de VRAM (12 Go recommandé) |
| Disque | ~35 Go au total |

Un GPU NVIDIA (CUDA) accélère considérablement les modèles IA lourds. Mesuré sur une RTX 4070 par rapport à un CPU moderne :

| Outil IA | Accélération avec GPU | Notes |
|---|---|---|
| Agrandissement IA (RealESRGAN 2×) | **~47×** | Le plus gros gain - moins d'une seconde contre ~33 s (plusieurs minutes sur les grandes images) |
| Amélioration des visages (CodeFormer) | **~12×** | ~0,9 s contre ~11 s |
| Transcription (Whisper) | ~4,5× | |
| Suppression / remplacement / floutage d'arrière-plan | ~4× | ~7 s sur GPU contre ~29 s sur CPU |
| Coloriser | ~1,8× | |
| OCR, détection de visages, yeux rouges, suppression du bruit | ~1× | Déjà rapide sur CPU - un GPU n'apporte rien |
| Restauration de photo | aucune | Limité par le CPU même sur un GPU (0 % d'utilisation du GPU) ; un CPU rapide compte plus qu'un GPU ici |

Les outils qui valent un GPU sont **l'agrandissement, l'amélioration des visages, la transcription et la suppression d'arrière-plan**. La détection de visages, l'OCR et les yeux rouges sont limités par le CPU et déjà rapides, un GPU n'apporte donc rien.

L'utilisation de VRAM en pic atteint 7,5 Go pendant un agrandissement avec amélioration des visages. Un GPU NVIDIA de 6 Go convient pour la plupart des outils IA pris individuellement, mais échouera sur l'agrandissement. 8-12 Go de VRAM gèrent tout.

L'accélération par iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge pour l'inférence IA aujourd'hui. Mapper `/dev/dri` dans le conteneur n'active pas l'accélération GPU de l'IA ; SnapOtter exécutera les outils IA sur CPU sauf si NVIDIA CUDA est disponible.

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

Requêtes de redimensionnement d'image parallèles sur le conteneur applicatif plafonné à 4 cœurs par défaut :

| Requêtes simultanées | Temps de réponse moyen | Erreurs |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

Le temps de réponse se dégrade de manière sous-linéaire sans erreur à mesure que le pool de workers sature. Augmenter la limite `cpus:` du conteneur applicatif (ou utiliser un hôte avec plus de cœurs) relève le plafond. Notez que les tâches lourdes (transcodage vidéo, IA sur CPU) mobilisent un worker pendant toute leur durée, dimensionnez donc le CPU selon votre nombre attendu de tâches lourdes simultanées, et pas seulement selon le nombre de requêtes.

### Formats d'image pris en charge {#supported-image-formats}

SnapOtter prend en charge **55+ formats d'entrée** et **14 formats de sortie**, dont les fichiers RAW de 20+ marques d'appareils photo, les formats professionnels (PSD, EPS, OpenEXR, HDR), les codecs modernes (JPEG XL, AVIF, HEIC, QOI) et les formats scientifiques/de jeu (FITS, DDS).

Consultez la [liste complète des formats](/fr/guide/supported-formats) pour les détails sur chaque format pris en charge, le décodeur utilisé et les contrôles de qualité disponibles.

### Limitations connues {#known-limitations}

- **Le redimensionnement sensible au contenu** plante sur les grandes images (>5 MP) en raison d'une limitation du binaire caire. Fonctionne bien avec des images plus petites.
- **Le décodage HEIF** prend 13-23 secondes. HEIC (la variante d'Apple) est bien plus rapide, à 0,3-0,9 seconde.
- **L'agrandissement** expire sur CPU pour tout ce qui dépasse les petites images. GPU requis pour un usage pratique.
- **L'amélioration des visages CodeFormer** est nettement plus lente que GFPGAN (53 s contre 2 s sur GPU). GFPGAN est recommandé pour la plupart des cas d'usage.

## Volumes {#volumes}

| Montage / Volume | Rôle | Requis ? |
|---|---|---|
| `/data` (app) | Modèles IA, venv Python, fichiers utilisateur | **Oui** - perte de fichiers sans lui |
| `/tmp/workspace` (app) | Fichiers de traitement temporaires (nettoyés automatiquement) | Recommandé |
| `SnapOtter-pgdata` (postgres) | Répertoire de données PostgreSQL (utilisateurs, paramètres, pipelines, tâches) | **Oui** - perte de données sans lui |
| `SnapOtter-redisdata` (redis) | Fichier append-only Redis pour des files de tâches durables | Recommandé |

### Montages liés (bind mounts) vs volumes nommés {#bind-mounts-vs-named-volumes}

**Volumes nommés** (recommandés) - Docker gère les permissions automatiquement :
```yaml
volumes:
  - SnapOtter-data:/data
```

**Montages liés** - Vous gérez les permissions. Réglez `PUID`/`PGID` pour correspondre à votre utilisateur hôte :
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Permissions de stockage {#storage-permissions}

SnapOtter écrit à deux emplacements à l'exécution : `/data` (fichiers utilisateur, journaux, modèles IA et le venv Python) et `/tmp/workspace` (espace de travail temporaire de traitement). Les deux doivent être accessibles en écriture par l'utilisateur sous lequel le conteneur s'exécute. Si l'un ne l'est pas, le conteneur **échoue rapidement au démarrage** avec un message nommant le répertoire, l'UID/GID en cours d'exécution et comment corriger, au lieu de démarrer « en bonne santé » puis d'échouer au premier téléversement avec une erreur cryptique.

La façon dont les permissions sont gérées dépend de la manière dont le conteneur est lancé :

**Par défaut (démarre en root, redescend vers `snapotter`)** - le point d'entrée démarre en root, corrige la propriété des volumes montés, puis redescend vers l'utilisateur non privilégié `snapotter` via `gosu`. Les volumes nommés fonctionnent sans aucune configuration. Pour les montages liés, réglez `PUID`/`PGID` sur votre utilisateur hôte (ci-dessus) afin que les fichiers qu'il écrit vous appartiennent.

**Kubernetes / OpenShift (non-root via `runAsUser`)** - lancé directement en tant qu'utilisateur non-root, le conteneur ne peut pas chown les volumes lui-même, l'orchestrateur doit donc les rendre accessibles en écriture. Réglez `fsGroup` :

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Les répertoires accessibles en écriture de l'image appartiennent au groupe GID 0 et sont accessibles en écriture par le groupe, de sorte qu'un pod s'exécutant avec un **UID arbitraire** plus le groupe supplémentaire root (le défaut OpenShift) peut écrire sans `chown`.

**TrueNAS Scale (et autres configurations à « UID étranger »)** - TrueNAS exécute les applications sous un utilisateur non-root (souvent `568:568`) et monte des jeux de données hôtes appartenant à un autre utilisateur, de sorte que ni le point d'entrée ni `fsGroup` ne les rendent accessibles en écriture par lui-même. Choisissez l'une des options :

- **Exécuter l'application en root** (recommandé) - laissez l'utilisateur de l'application non défini ou réglez-le sur `0`, et laissez le point d'entrée par défaut corriger les permissions et redescendre vers `snapotter`.
- **Exécuter en tant qu'UID `999`** - réglez l'utilisateur/groupe de l'application sur `999:999` (l'utilisateur intégré `snapotter` de SnapOtter) pour qu'il corresponde à la propriété de l'image.
- **`chown` le jeu de données hôte** vers l'UID sous lequel le conteneur s'exécute, depuis le shell TrueNAS :

  ```bash
  # Utilisez l'UID de l'erreur de démarrage (ou exécutez `id` dans le conteneur)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

L'erreur de démarrage nomme l'UID exact à utiliser, le chemin le plus rapide est donc de démarrer l'application une fois, de lire le message, puis d'exécuter `chown` (ou d'ajuster l'utilisateur) en conséquence.

## Variables d'environnement {#environment-variables}

| Variable | Défaut | Description |
|---|---|---|
| `AUTH_ENABLED` | `true` | Activer/désactiver l'exigence de connexion |
| `DEFAULT_USERNAME` | `admin` | Nom d'utilisateur admin initial |
| `DEFAULT_PASSWORD` | `admin` | Mot de passe admin initial (changement forcé à la première connexion) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Limite de téléversement par fichier |
| `MAX_BATCH_SIZE` | `100` | Nombre max de fichiers par requête de lot |
| `RATE_LIMIT_PER_MIN` | `1000` | Requêtes API par minute et par IP (mettez 0 pour désactiver) |
| `MAX_USERS` | `0` (illimité) | Nombre maximal de comptes utilisateur |
| `TRUST_PROXY` | `true` | Faire confiance aux en-têtes X-Forwarded-For du reverse proxy |
| `PUID` | `999` | Exécuter sous cet UID (pour les permissions de montage lié) |
| `PGID` | `999` | Exécuter sous ce GID (pour les permissions de montage lié) |
| `LOG_LEVEL` | `info` | Verbosité des journaux : fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Nombre max de tâches de traitement IA en parallèle |
| `SESSION_DURATION_HOURS` | `168` | Durée de vie de la session de connexion (7 jours) |
| `CORS_ORIGIN` | (vide) | Origines autorisées séparées par des virgules, ou vide pour même origine |

### Proxy sortant et CA privée {#outbound-proxy-and-private-ca}

Le conteneur officiel permet la prise en charge du proxy d'environnement de Node. Si SnapOtter doit atteindre le référentiel d'exécution OCR ou d'autres services HTTPS via un proxy d'entreprise, définissez `HTTPS_PROXY` (et `HTTP_PROXY` si nécessaire). Définissez `NO_PROXY` sur une liste d'hôtes séparés par des virgules qui doivent être atteints directement, tels que Postgres, Redis et le stockage d'objets interne.

Si le proxy ou un service interne est signé par une autorité de certification privée, montez le certificat CA en lecture seule et pointez `NODE_EXTRA_CA_CERTS` vers celui-ci. Le fichier doit exister au démarrage du processus Node :

```yaml
services:
  app:
    environment:
      HTTPS_PROXY: http://proxy.example.internal:3128
      HTTP_PROXY: http://proxy.example.internal:3128
      NO_PROXY: postgres,redis,minio,localhost,127.0.0.1
      NODE_EXTRA_CA_CERTS: /etc/snapotter/custom-ca.pem
    volumes:
      - ./company-ca.pem:/etc/snapotter/custom-ca.pem:ro
```

Conservez les informations d'identification du proxy en dehors du fichier Compose (par exemple dans un fichier `.env` protégé ou secret). Ne désactivez pas la vérification TLS : l'index OCR signé authentifie les métadonnées de version, tandis que la validation TLS normale protège toujours le transport et toutes les autres requêtes sortantes.

## Vérification d'état (health check) {#health-check}

Le conteneur inclut une vérification d'état intégrée :

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse proxy {#reverse-proxy}

SnapOtter définit `TRUST_PROXY=true` par défaut afin que la limitation de débit et la journalisation utilisent l'IP client réelle issue des en-têtes `X-Forwarded-For`.

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
2. Réglez Domain Name sur votre domaine
3. Réglez Scheme sur `http`, Forward Hostname sur `SnapOtter` (ou l'IP de votre conteneur), Forward Port sur `1349`
4. Activez la prise en charge WebSocket
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

`flush_interval -1` désactive la mise en tampon des réponses, ce qui est requis pour les événements de progression SSE (traitement par lots, outils IA, installations de fonctionnalités). Les délais d'expiration étendus permettent aux gros téléversements de fichiers de se terminer sans que Caddy ne ferme la connexion trop tôt.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Remarque : Cloudflare impose une limite de téléversement de 100 Mo sur les offres gratuites. Réglez `MAX_UPLOAD_SIZE_MB=100` en conséquence.

## CI/CD {#ci-cd}

Le dépôt GitHub comporte trois workflows :

- **ci.yml** - S'exécute automatiquement à chaque push et PR. Effectue le lint, la vérification de types, les tests, la construction et la validation de l'image Docker (sans push).
- **release.yml** - Déclenché manuellement via `workflow_dispatch`. Exécute semantic-release pour créer un tag de version et une release GitHub, puis construit une image Docker multi-architecture (amd64 + arm64) et la pousse vers Docker Hub (`snapotter/snapotter`) et GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Construit ce site de documentation et le déploie sur Cloudflare Pages lors d'un push vers `main`.

Pour créer une release, allez dans **Actions > Release > Run workflow** dans l'interface GitHub, ou exécutez :

```bash
gh workflow run release.yml
```

Semantic-release détermine la version à partir de l'historique des commits. Le tag Docker `latest` pointe toujours vers la release la plus récente.

## Analytique {#analytics}

SnapOtter inclut une analytique produit anonyme (schémas d'utilisation des outils, rapports d'erreurs) pour aider à détecter les bugs et améliorer les fonctionnalités. Elle est activée par défaut. Vos fichiers, leurs noms et vos données personnelles n'en font jamais partie. SnapOtter fonctionne normalement avec l'analytique désactivée.

### Désactiver l'analytique {#disabling-analytics}

Le retrait à l'exécution est un basculement admin en un clic. Ouvrez Settings > System > Privacy et désactivez Anonymous Product Analytics. Cela s'arrête immédiatement pour toute l'instance, sans reconstruction requise.

Pour une image qui ne peut jamais émettre d'analytique, définissez l'arrêt matériel au moment de la construction en clonant le dépôt et en le reconstruisant :

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Ou ajoutez l'argument de construction à votre `docker-compose.yml` existant :

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
