---
description: "Guide de durcissement de la sécurité pour SnapOtter. Sécurité des conteneurs, isolation réseau, secrets Docker, déploiement Kubernetes et artefacts de conformité."
i18n_source_hash: 986f7658430c
i18n_provenance: human
i18n_output_hash: 8bb727ee4418
---

# Sécurité et durcissement {#security-hardening}

SnapOtter traite les fichiers entièrement sur votre infrastructure. Il envoie par défaut une analytique produit anonyme et sans contenu ainsi que des rapports de plantage pour aider à améliorer le projet. Il n'envoie jamais vos fichiers, leurs noms, leur contenu, la sortie OCR, les métadonnées d'image ou le texte des documents. Le retour d'expérience facultatif n'est envoyé qu'après qu'un utilisateur l'a soumis, uniquement lorsque l'analytique est activée, et les champs de contact ne sont inclus qu'avec un consentement de contact explicite. Un administrateur peut désactiver la capture de l'analytique et des retours en un clic sous Settings > System > Privacy, sans reconstruction requise. Le traitement des fichiers reste toujours à l'intérieur de votre conteneur.

Le conteneur s'exécute sous un utilisateur non-root dédié (`snapotter`) avec toutes les capacités Linux abandonnées à l'exception de l'ensemble minimal requis. Pour la politique complète de divulgation de vulnérabilités et l'architecture de sécurité, consultez [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) sur GitHub.

## Durcissement du conteneur {#container-hardening}

Le [docker-compose.yml par défaut](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) inclut un durcissement de sécurité pour la production. Voici une explication de chaque option et de son importance :

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

### Pourquoi `no-new-privileges` n'est pas défini {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` est intentionnellement omis. Le point d'entrée démarre en root pour corriger la propriété des volumes, puis redescend vers l'utilisateur `snapotter` via [gosu](https://github.com/tianon/gosu), qui nécessite setuid. Une fois l'abandon de privilège terminé, le processus s'exécute en tant que `snapotter` avec toutes les capacités supprimées sauf les cinq listées ci-dessus.

Si vous utilisez Kubernetes ou le flag `--user` de Docker pour exécuter directement en non-root (en contournant gosu), `no-new-privileges` peut être activé en toute sécurité.

### Pourquoi `read_only` n'est pas défini {#why-read-only-is-not-set}

`read_only: true` n'est pas défini parce que le remappage PUID/PGID écrit dans `/etc/passwd` et `/etc/group` au démarrage. Si vous utilisez le flag `--user` de Docker ou `runAsUser` de Kubernetes au lieu de PUID/PGID, vous pouvez activer sans risque un système de fichiers racine en lecture seule.

## Isolation réseau {#network-isolation}

En fonctionnement normal, le conteneur n'établit **aucune connexion réseau sortante**. Tout le traitement des fichiers se fait localement à l'aide de bibliothèques fournies.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

La seule exception concerne les **téléchargements de modèles IA** : lorsqu'un utilisateur installe un bundle de fonctionnalités IA via l'interface, le conteneur télécharge l'archive de bundle préconstruite depuis Hugging Face, ainsi que quelques fichiers de modèles individuels depuis GitHub Releases, Google Storage et PyPI. Ces téléchargements ont lieu une fois par bundle et sont stockés dans le volume `/data`.

**Recommandations de pare-feu :**

| Scénario | Règle sortante |
|---|---|
| Isolé du réseau (sans IA) | Bloquer tout le trafic sortant du conteneur |
| Bundles IA nécessaires | Autoriser HTTPS vers `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org` pendant l'installation, puis bloquer |
| Après l'installation IA | Bloquer tout le trafic sortant - les modèles sont mis en cache localement |

Les archives de bundles sont servies depuis le stockage Xet de Hugging Face, qui transfère via les points de terminaison `*.xethub.hf.co` en parallèle et qui rend rapides les téléchargements de bundles de plusieurs Go. Si votre pare-feu autorise `huggingface.co` mais bloque `*.xethub.hf.co`, les installations réussissent quand même mais se replient sur un téléchargement plus lent en flux unique, ajoutez donc les hôtes Xet à la liste d'autorisation pour rester sur le chemin rapide. Les installations entièrement hors ligne peuvent contourner tout cela et utiliser plutôt l'[import de bundle hors ligne](/fr/guide/deployment).

Pour la configuration du reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), consultez le [guide de déploiement](/fr/guide/deployment#reverse-proxy).

## Secrets Docker {#docker-secrets}

Pour les déploiements en production, évitez de passer les secrets sous forme de variables d'environnement en clair. Le point d'entrée prend en charge la convention `_FILE` de Docker : montez un secret sous forme de fichier et réglez la variable `_FILE` correspondante sur son chemin.

**Secrets pris en charge :**

| Variable | Équivalent `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Exemple avec les secrets Docker Compose :**

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
Les secrets Docker Compose (sans Swarm) nécessitent Compose v2.23 ou une version ultérieure.
:::

## Déploiement Kubernetes {#kubernetes-deployment}

Le point d'entrée détecte quand le conteneur s'exécute déjà en non-root (par ex. via `runAsUser` de Kubernetes) et saute automatiquement l'abandon de privilège gosu. Dans ce cas, il ne peut pas chown les volumes montés lui-même, il vérifie donc qu'ils sont accessibles en écriture et se termine tôt avec des indications exploitables s'ils ne le sont pas - consultez [Permissions de stockage](/fr/guide/deployment#storage-permissions) pour `fsGroup` et les configurations à UID étranger (TrueNAS, OpenShift).

**SecurityContext de Pod recommandé :**

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

Comme `runAsUser: 999` est défini au niveau du pod, le point d'entrée saute entièrement gosu. Cela permet les capacités `allowPrivilegeEscalation: false` et `drop: [ALL]` sans conflit.

Pour le dimensionnement des ressources, consultez [Exigences matérielles](/fr/guide/deployment#hardware-requirements).

## Sauvegarde et récupération {#backup-and-recovery}

L'état persistant est réparti sur deux volumes :

| Volume | Contenu | Critique ? |
|---|---|---|
| `SnapOtter-pgdata` | Base de données PostgreSQL (utilisateurs, paramètres, pipelines, tâches, journal d'audit) | Oui |
| `/data` (volume app) | Fichiers téléversés par les utilisateurs, modèles IA, venv Python | Partiellement (voir ci-dessous) |

Au sein du volume `/data` :

| Chemin | Contenu | Critique ? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Fichiers utilisateur et résultats de traitement | Oui |
| `/data/ai/` | Fichiers de modèles IA téléchargés | Non (re-téléchargeables) |
| `/data/venv/` | Environnement virtuel Python | Non (reconstruit au démarrage) |

### Sauvegarde de la base de données {#database-backup}

Utilisez `pg_dump` pour sauvegarder la base de données pendant que la pile tourne :

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Vous pouvez aussi arrêter la pile et prendre un instantané du volume `SnapOtter-pgdata` :

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Sauvegarde des fichiers utilisateur {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

Les modèles IA totalisent jusqu'à environ 24 Go pour tous les bundles. Comme ils sont re-téléchargeables, excluez `/data/ai/` et `/data/venv/` des sauvegardes pour économiser de l'espace. Seuls la base de données et les fichiers utilisateur sont critiques.

## Artefacts de conformité {#compliance-artifacts}

Chaque release de SnapOtter inclut les artefacts de sécurité suivants :

| Artefact | Format | Où le trouver |
|---|---|---|
| SBOM (CycloneDX) | JSON | Ressource de la [release GitHub](https://github.com/snapotter-hq/SnapOtter/releases) : `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Ressource de la [release GitHub](https://github.com/snapotter-hq/SnapOtter/releases) : `snapotter-v{version}-sbom.spdx.json` |
| Analyse de vulnérabilités | JSON Trivy | Ressource de la [release GitHub](https://github.com/snapotter-hq/SnapOtter/releases) : `snapotter-v{version}-trivy.json` |
| Analyse de vulnérabilités | SARIF | Onglet [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Analyse statique | CodeQL (JS/TS + Python) | Onglet [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), s'exécute chaque semaine + par PR |
| Revue de dépendances | Native GitHub | Vérification par PR, échoue sur les ajouts à haute gravité |
| Audit des dépendances Python | pip-audit | Journal d'exécution CI à chaque push |
| Politique de sécurité | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) dans le dépôt |
| Mises à jour des dépendances | Dependabot | PR hebdomadaires automatisées pour npm, pip, Docker, Actions |

**Exécuter votre propre analyse :**

Téléchargez le SBOM depuis la release et analysez-le avec l'outil de votre choix :

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
Le SBOM et l'analyse de vulnérabilités reflètent l'image exacte publiée pour cette release. Les bundles de modèles IA installés après le déploiement ne sont pas inclus dans le SBOM puisqu'ils sont téléchargés à l'exécution.
:::
