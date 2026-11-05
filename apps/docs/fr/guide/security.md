---
description: "Guide de durcissement de la sécurité pour SnapOtter. Sécurité des conteneurs, isolation réseau, secrets Docker, déploiement Kubernetes et artefacts de conformité."
i18n_source_hash: 5cf773ddb4c0
i18n_provenance: machine
i18n_output_hash: 4e581cd76720
i18n_hash_version: 2
---

# Sécurité et durcissement {#security-hardening}

SnapOtter traite les fichiers entièrement sur votre infrastructure. Par défaut, il envoie des analyses de produit et des rapports de plantage anonymes et sans contenu, afin d'aider à améliorer le projet. Il n'envoie jamais vos fichiers, noms de fichiers, contenus de fichiers, sorties d'OCR, métadonnées d'image ni textes de documents. Les retours facultatifs ne sont envoyés qu'une fois soumis par un utilisateur, uniquement lorsque les analyses sont activées, et les champs de contact ne sont inclus qu'avec un consentement explicite au contact. Un administrateur peut désactiver les analyses et la collecte des retours en un clic dans Paramètres > Système > Confidentialité, sans reconstruction. Le traitement des fichiers reste toujours à l'intérieur de votre conteneur.

Le conteneur s'exécute sous un utilisateur dédié non root (`snapotter`), avec toutes les capacités Linux supprimées à l'exception de l'ensemble minimal requis. Pour la politique complète de divulgation des vulnérabilités et l'architecture de sécurité, consultez [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) sur GitHub.

## Durcissement des conteneurs {#container-hardening}

Les fichiers Compose de référence [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) et [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) font foi. Ne copiez pas un exemple abrégé en production ; déployez le fichier du tag de version que vous avez vérifié.

Les deux piles appliquent les contrôles suivants :

- Des limites de mémoire, de swap, de CPU et de PID contiennent les traitements natifs incontrôlés.
- Chaque service supprime toutes les capacités Linux. L'application ne rajoute que `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` pour la propriété des volumes, l'abandon d'identité à sens unique `gosu` et la transmission propre des signaux. PostgreSQL et Redis ne reçoivent que le sous-ensemble dont leurs points d'entrée officiels ont besoin.
- `security_opt: [no-new-privileges:true]` empêche les processus des conteneurs de l'application, de PostgreSQL et de Redis d'obtenir des privilèges supplémentaires. Cela reste compatible avec `gosu` : le point d'entrée démarre en tant que root, prépare les volumes, puis bascule uniquement vers l'utilisateur dédié `snapotter`.
- Les entrées d'image PostgreSQL et Redis sont épinglées par digest. L'application doit de même être épinglée sur un tag de version ou un digest vérifié plutôt que sur `latest`.
- Les contrôles de santé, la rotation bornée des journaux JSON, l'AOF Redis durable et la politique de redémarrage sont définis de manière centralisée dans les fichiers de référence.

Pour un déploiement exposé sur Internet, liez le port 1349 à l'interface de bouclage et terminez TLS sur un reverse proxy maintenu. Générez des identifiants PostgreSQL et Redis uniques, stockez les secrets dans des fichiers protégés ou un gestionnaire de secrets, et changez immédiatement le mot de passe administrateur initial.

### Pourquoi `read_only` n'est pas défini {#why-read-only-is-not-set}

`read_only: true` n'est pas défini car le remappage PUID/PGID écrit dans `/etc/passwd` et `/etc/group` au démarrage. Si vous utilisez l'option `--user` de Docker ou `runAsUser` de Kubernetes à la place de PUID/PGID, vous pouvez activer sans risque un système de fichiers racine en lecture seule.

## Isolation réseau {#network-isolation}

Le traitement des fichiers est local, mais une installation par défaut **n'est pas un système sans trafic sortant**. Les analyses de produit anonymes utilisent PostHog et le rapport de plantage utilise Sentry lorsque la télémétrie est activée. Définissez `SNAPOTTER_TELEMETRY=0` (ou désactivez les analyses dans Paramètres > Système > Confidentialité) pour désactiver les deux. SnapOtter n'inclut jamais les fichiers téléversés, les noms de fichiers, les sorties d'OCR, les textes de documents ou tout autre contenu de fichier dans ces événements.

Le reste du trafic sortant dépend des fonctionnalités : l'installation des bundles et modèles d'IA télécharge des entrées de version signées ; l'import par URL récupère une URL publique demandée par l'utilisateur ; et les intégrations explicitement configurées (OIDC, SAML, OpenTelemetry, webhooks, stockage compatible S3 ou similaire) contactent les destinations choisies par l'administrateur. Les téléchargements de modèles à l'exécution sont désactivés par défaut. Définissez `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` uniquement pour activer explicitement les téléchargements de secours automatiques. Un [import de bundle hors ligne](/fr/guide/deployment) permet de provisionner les fonctionnalités d'IA sans trafic sortant lié aux modèles à l'exécution.

**Recommandations de pare-feu :**

| Scénario | Règle sortante |
|---|---|
| Réseau isolé (air-gapped) | Définissez `SNAPOTTER_TELEMETRY=0` et `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, utilisez l'import de bundle d'IA hors ligne, désactivez l'import par URL et les intégrations externes, puis bloquez le trafic sortant |
| Télémétrie par défaut | Autorisez les points de terminaison PostHog et Sentry listés par les journaux de votre navigateur ou de votre réseau ; désactivez la télémétrie si votre politique ne les permet pas |
| Bundles d'IA nécessaires | Pendant l'installation, autorisez HTTPS vers `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org` ; puis bloquez ces hôtes |
| Intégrations externes | N'autorisez que les destinations OIDC/SAML/OTLP/webhook/stockage objet exactement configurées par l'administrateur |

Les archives de bundles sont servies depuis le stockage Xet de Hugging Face, qui transfère en parallèle via les points de terminaison `*.xethub.hf.co` et rend rapides les téléchargements de bundles de plusieurs Go. Si votre pare-feu autorise `huggingface.co` mais bloque `*.xethub.hf.co`, les installations réussissent toujours mais basculent sur un téléchargement à flux unique plus lent : ajoutez donc les hôtes Xet à la liste d'autorisation pour rester sur la voie rapide. Les installations entièrement hors ligne peuvent ignorer tout cela et utiliser plutôt l'[import de bundle hors ligne](/fr/guide/deployment).

Pour la configuration d'un reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), consultez le [guide de déploiement](/fr/guide/deployment#reverse-proxy).

## Secrets Docker {#docker-secrets}

Pour les déploiements de production, évitez de transmettre les secrets sous forme de variables d'environnement en clair. Le point d'entrée prend en charge la convention `_FILE` de Docker : montez un secret en tant que fichier et définissez la variable `_FILE` correspondante sur son chemin.

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
Les secrets Docker Compose (sans Swarm) nécessitent Compose v2.23 ou version ultérieure.
:::

## Déploiement Kubernetes {#kubernetes-deployment}

Le point d'entrée détecte lorsque le conteneur s'exécute déjà en tant que non-root (par exemple via `runAsUser` de Kubernetes) et ignore automatiquement l'abandon de privilèges gosu. Dans ce cas, il ne peut pas exécuter chown sur les volumes montés lui-même : il vérifie donc qu'ils sont accessibles en écriture et s'arrête immédiatement avec des consignes exploitables s'ils ne le sont pas. Consultez [Autorisations de stockage](/fr/guide/deployment#storage-permissions) pour `fsGroup` et les configurations à UID étranger (TrueNAS, OpenShift).

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

Comme `runAsUser: 999` est défini au niveau du pod, le point d'entrée ignore entièrement gosu. Cela permet d'utiliser les capacités `allowPrivilegeEscalation: false` et `drop: [ALL]` sans conflit.

Pour le dimensionnement des ressources, consultez [Configuration matérielle requise](/fr/guide/deployment#hardware-requirements).

## Sauvegarde et récupération {#backup-and-recovery}

La pile Compose de production définit quatre volumes. Coupez les entrées et laissez les tâches actives se terminer avant d'effectuer une sauvegarde coordonnée, afin que PostgreSQL, Redis et l'état des fichiers décrivent le même instant.

| Volume | Contenu | Traitement pour la récupération |
|---|---|---|
| `SnapOtter-pgdata` | Utilisateurs PostgreSQL, paramètres, pipelines, tâches, métadonnées de fichiers et journal d'audit | Critique ; utilisez un dump logique à arrêt immédiat en cas d'erreur pour une récupération portable |
| `SnapOtter-data` | Objets de la bibliothèque enregistrés, journaux et état de l'IA (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Sauvegardez le volume entier ; pour gagner de la place, omettez délibérément tout l'état de l'IA et réinstallez ses bundles |
| `SnapOtter-redisdata` | AOF Redis pour l'état durable de la file BullMQ | Sauvegardez après avoir mis l'application en pause et forcé `SAVE` ; nécessaire pour reprendre exactement le travail en file d'attente |
| `SnapOtter-workspace` | Clés temporaires du stockage objet (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | Ne sauvegardez pas une fois toutes les tâches vidées ou annulées ; ne la supprimez jamais tant que des tâches sont actives |

Compose préfixe normalement les noms de volumes avec le nom du projet. Déterminez le volume source réel à partir du conteneur monté au lieu de supposer qu'un nom d'affichage tel que `SnapOtter-data` est le nom du volume Docker.

### Sauvegarde de la base de données {#database-backup}

Utilisez le format d'archive personnalisé de PostgreSQL et vérifiez l'archive avant de considérer la sauvegarde comme terminée :

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

Testez chaque sauvegarde en la restaurant dans une pile isolée, en vérifiant les enregistrements de la base de données et les sommes de contrôle des fichiers, puis en démarrant l'application. Le `tests/qa/backup-restore-drill.sh` du dépôt automatise cette étape de validation de version sur un `QA_IMAGE` explicite.

Si votre plateforme effectue plutôt des instantanés de volumes cohérents après plantage, arrêtez d'abord toute la pile et faites un instantané de tous les volumes critiques comme un seul ensemble. Une copie brute du répertoire de données PostgreSQL depuis un conteneur en cours d'exécution n'est pas une sauvegarde logique prise en charge.

### Sauvegarde des fichiers et de la file d'attente {#file-and-queue-backup}

Mettez l'application en pause avant de capturer les volumes de fichiers et de file d'attente. Utilisez `docker inspect` pour déterminer le nom réel du volume, forcez Redis à persister son état actuel et archivez en conservant les propriétaires et les permissions :

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

Redémarrez Redis avant l'application. Si vous excluez intentionnellement `/data/ai`, supprimez toute l'arborescence de l'IA plutôt que de conserver un enregistrement `installed.json` sans ses modèles ni son environnement virtuel. Gardez les fichiers de sauvegarde chiffrés, soumis à un contrôle d'accès et séparés de l'hôte qui exécute SnapOtter.

## Artefacts de conformité {#compliance-artifacts}

Chaque version de SnapOtter inclut les artefacts de sécurité suivants :

| Artefact | Format | Où le trouver |
|---|---|---|
| Liaison du sujet de version | JSON canonique + attestation GitHub | Ressource de la [version GitHub](https://github.com/snapotter-hq/SnapOtter/releases) : `snapotter-v{version}-release-subjects.json` |
| SBOM de l'archive | CycloneDX et SPDX JSON | Ressources de la version : `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| SBOM de l'image | CycloneDX et SPDX JSON | Ressources de la version : `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Analyses de vulnérabilités | Trivy JSON | Ressources de la version avec les préfixes `archive-linux-{arch}` ou `image-linux-{arch}` correspondants |
| Analyse de vulnérabilités | SARIF | Onglet [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Analyse statique | CodeQL (JS/TS + Python) | Onglet [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), exécutée chaque semaine et à chaque PR |
| Revue des dépendances | Natif GitHub | Vérification par PR, échoue sur les ajouts de gravité élevée |
| Audit des dépendances Python | pip-audit | Journal d'exécution CI à chaque push |
| Politique de sécurité | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) dans le dépôt |
| Mises à jour des dépendances | Dependabot | PR hebdomadaires automatisées pour npm, pip, Docker, Actions |

**Lancer votre propre analyse :**

Téléchargez le manifeste du sujet de version et vérifiez qu'il a été attesté par le workflow de version :

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Le manifeste enregistre séparément `releaseTag`, `releaseCommit` et `workflowTriggerCommit`. Vérifiez que `releaseCommit` est le commit extrait du tag immuable, puis vérifiez le condensat SHA-256 de l'archive, de l'image, du SBOM ou de l'analyse que vous utilisez par rapport à son entrée dans `subjects`. Cette distinction est intentionnelle : extraire un commit de version nouvellement créé ne change pas l'identité du commit dans les identifiants OIDC du workflow.

Vous pouvez aussi analyser directement un SBOM téléchargé ou l'image :

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
Les SBOM et analyses de l'image reflètent l'image exacte, propre à chaque architecture, publiée pour cette version. Les SBOM et analyses de l'archive décrivent séparément l'archive précompilée. Les bundles de modèles d'IA installés après le déploiement ne sont pas inclus dans ces SBOM, car ils sont téléchargés à l'exécution.
:::
