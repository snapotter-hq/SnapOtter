---
description: "Guide de durcissement de la sécurité pour SnapOtter. Sécurité des conteneurs, isolation réseau, secrets Docker, déploiement Kubernetes et artefacts de conformité."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: ff0e77083923
i18n_hash_version: 2
---

# Sécurité et durcissement {#security-hardening}

SnapOtter traite les fichiers entièrement sur votre infrastructure. Il envoie par défaut une analytique produit anonyme et sans contenu ainsi que des rapports de plantage pour aider à améliorer le projet. Il n'envoie jamais vos fichiers, leurs noms, leur contenu, la sortie OCR, les métadonnées d'image ou le texte des documents. Le retour d'expérience facultatif n'est envoyé qu'après qu'un utilisateur l'a soumis, uniquement lorsque l'analytique est activée, et les champs de contact ne sont inclus qu'avec un consentement de contact explicite. Un administrateur peut désactiver la capture de l'analytique et des retours en un clic sous Settings > System > Privacy, sans reconstruction requise. Le traitement des fichiers reste toujours à l'intérieur de votre conteneur.

Le conteneur s'exécute sous un utilisateur non-root dédié (`snapotter`) avec toutes les capacités Linux abandonnées à l'exception de l'ensemble minimal requis. Pour la politique complète de divulgation de vulnérabilités et l'architecture de sécurité, consultez [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) sur GitHub.

## Durcissement des conteneurs {#container-hardening}

Les fichiers canoniques [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) et [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) Compose sont la source de vérité. Ne copiez pas un exemple abrégé en production ; déployez le fichier à partir de la balise de version que vous avez vérifiée.

Les deux piles appliquent les contrôles suivants :

- Les limites de mémoire, d'échange, de CPU et de PID contiennent un traitement natif incontrôlable.
- Chaque service supprime toutes les fonctionnalités Linux. L'application ajoute uniquement `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` pour la propriété du volume, la suppression d'identité unidirectionnelle `gosu` et le transfert gracieux du signal. PostgreSQL et Redis reçoivent uniquement le sous-ensemble dont leurs points d'entrée officiels ont besoin.
- `security_opt: [no-new-privileges:true]` empêche les processus des conteneurs d'application, PostgreSQL et Redis d'obtenir des privilèges supplémentaires. Cela reste compatible avec `gosu` : le point d'entrée commence en tant que root, prépare les volumes et ne descend que vers l'utilisateur dédié `snapotter`.
- Les entrées d'image PostgreSQL et Redis sont épinglées par digest. L'application doit également être épinglée sur une balise de version vérifiée ou un résumé plutôt que sur `latest`.
- Les vérifications de l'état, la rotation limitée des journaux JSON, l'AOF Redis durable et la politique de redémarrage sont définis de manière centralisée dans les fichiers canoniques.

Pour un déploiement accessible sur Internet, liez le port 1349 au bouclage et terminez TLS sur un proxy inverse maintenu. Générez des informations d'identification PostgreSQL et Redis uniques, stockez les secrets dans des fichiers protégés ou dans un gestionnaire de secrets et modifiez immédiatement le mot de passe administrateur initial.

### Pourquoi `read_only` n'est pas défini {#why-read-only-is-not-set}

`read_only: true` n'est pas défini car le remappage PUID/PGID écrit dans `/etc/passwd` et `/etc/group` au démarrage. Si vous utilisez l'indicateur `--user` de Docker ou Kubernetes `runAsUser` au lieu de PUID/PGID, vous pouvez activer en toute sécurité un système de fichiers racine en lecture seule.

## Isolation du réseau {#network-isolation}

Le traitement des fichiers est local, mais une installation par défaut n'est **pas un système sans sortie**. Les analyses de produits anonymes utilisent PostHog et les rapports d'erreur utilisent Sentry lorsque la télémétrie est activée. Définissez `SNAPOTTER_TELEMETRY=0` (ou désactivez les analyses sous Paramètres > Système > Confidentialité) pour désactiver les deux. SnapOtter n'inclut jamais les fichiers téléchargés, les noms de fichiers, la sortie OCR, le texte du document ou tout autre contenu de fichier dans ces événements.

L'autre trafic sortant est axé sur les fonctionnalités : l'installation du bundle/modèle AI télécharge les entrées de version signées ; L'importation d'URL récupère une URL publique demandée par l'utilisateur ; et les OIDC, SAML, OpenTelemetry, les webhooks, le stockage compatible S3 ou les intégrations similaires explicitement configurés contactent les destinations choisies par l'administrateur. Les téléchargements de modèles à l'exécution sont désactivés par défaut. Définissez `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` uniquement pour activer explicitement les téléchargements automatiques de secours. Une [importation de bundle hors ligne](/fr/guide/deployment) peut fournir des fonctionnalités d'IA sans sortie du modèle d'exécution.

**Recommandations de pare-feu :**

|Scénario|Règle sortante|
|---|---|
|Entrefer|Définissez `SNAPOTTER_TELEMETRY=0` et `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, utilisez l'importation de bundles d'IA hors ligne, désactivez l'importation d'URL et les intégrations externes, puis bloquez la sortie.|
|Télémétrie par défaut|Autorisez les points de terminaison PostHog et Sentry répertoriés par les journaux de votre navigateur/réseau ; désactiver la télémétrie si la politique ne le permet pas|
|Bundles IA nécessaires|Pendant l'installation, autorisez HTTPS vers `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org` ; puis bloquez ces hôtes|
|Intégrations externes|Autoriser uniquement les destinations exactes OIDC/SAML/OTLP/webhook/object-storage configurées par l'administrateur|

Les archives de bundles sont servies à partir du stockage Xet de Hugging Face, qui est transféré en parallèle sur les points de terminaison `*.xethub.hf.co` et qui accélère les téléchargements de bundles de plusieurs Go. Si votre pare-feu autorise `huggingface.co` mais bloque `*.xethub.hf.co`, les installations réussissent toujours mais reviennent à un téléchargement à flux unique plus lent, donc ajoutez les hôtes Xet à la liste d'autorisation pour rester sur la voie rapide. Les installations entièrement hors ligne peuvent ignorer tout cela et utiliser [Importation groupée hors ligne](/fr/guide/deployment) à la place.

Pour la configuration du proxy inverse (Nginx, Traefik, Caddy, Cloudflare Tunnels), consultez le [Guide de déploiement](/fr/guide/deployment#reverse-proxy).

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

La pile de production Compose définit quatre volumes. Arrêtez l'entrée et laissez les tâches actives se terminer avant d'effectuer une sauvegarde coordonnée afin que PostgreSQL, Redis et l'état du fichier décrivent le même moment dans le temps.

|Volume|Contenu|Traitement de récupération|
|---|---|---|
|`SnapOtter-pgdata`|Utilisateurs PostgreSQL, paramètres, pipelines, tâches, métadonnées de fichiers et journal d'audit|Critique; utiliser un vidage logique ultra-rapide pour la récupération portable|
|`SnapOtter-data`|Objets de bibliothèque enregistrés, journaux et état de l'IA (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|Sauvegardez tout le volume ; pour économiser de l'espace, omettez délibérément tout état de l'IA et réinstallez ses bundles|
|`SnapOtter-redisdata`|Redis AOF pour un état de file d'attente BullMQ durable|Sauvegardez après avoir mis l'application en pause et forcé `SAVE` ; requis pour reprendre exactement le travail en file d'attente|
|`SnapOtter-workspace`|Clés de stockage d'objets temporaires (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|Ne sauvegardez pas une fois que toutes les tâches ont été épuisées ou annulées ; ne le jetez jamais pendant que les tâches sont actives|

Compose préfixe normalement les noms de volumes avec le nom du projet. Résolvez le volume source réel à partir du conteneur monté au lieu de supposer qu'un nom d'affichage tel que `SnapOtter-data` est le nom du volume Docker.

### Sauvegarde de la base de données {#database-backup}

Utilisez le format d'archive personnalisé de PostgreSQL et vérifiez l'archive avant de considérer la sauvegarde comme terminée :

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

Testez chaque sauvegarde en la restaurant dans une pile isolée, en vérifiant les enregistrements de la base de données et les sommes de contrôle des fichiers, puis en démarrant l'application. Le `tests/qa/backup-restore-drill.sh` du référentiel automatise cette porte de libération par rapport à un `QA_IMAGE` explicite.

Si votre plate-forme prend plutôt des instantanés de volume cohérents en cas de panne, arrêtez d'abord la pile entière et capturez tous les volumes critiques en un seul ensemble. Une copie brute du répertoire de données PostgreSQL à partir d'un conteneur en cours d'exécution n'est pas une sauvegarde logique prise en charge.

### Sauvegarde de fichiers et de files d'attente {#file-and-queue-backup}

Suspendez l'application avant de capturer les volumes de fichiers et de files d'attente. Utilisez `docker inspect` pour résoudre le nom réel du volume, forcer Redis à conserver son état actuel et à archiver en conservant la propriété et les autorisations :

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

Redémarrez Redis avant l'application. Si vous excluez intentionnellement `/data/ai`, supprimez l'intégralité du sous-arbre AI plutôt que de conserver un enregistrement `installed.json` sans ses modèles ni son environnement virtuel. Conservez les fichiers de sauvegarde cryptés, dont l'accès est contrôlé et séparés de l'hôte exécutant SnapOtter.

## Artefacts de conformité {#compliance-artifacts}

Chaque version SnapOtter inclut les artefacts de sécurité suivants :

| Artefact | Format | Où le trouver |
|---|---|---|
| Libérer la liaison du sujet | Attestation canonique JSON + GitHub | Élément [Version GitHub](https://github.com/snapotter-hq/SnapOtter/releases) : `snapotter-v{version}-release-subjects.json` |
| Archiver SBOM | CycloneDX et SPDX JSON | Actifs de version : `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Image SBOM | CycloneDX et SPDX JSON | Actifs de version : `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Analyses de vulnérabilité | Trivy JSON | Publier des ressources avec les préfixes `archive-linux-{arch}` ou `image-linux-{arch}` correspondants |
| Analyse de vulnérabilité | SARIF | Onglet [Sécurité GitHub](https://github.com/snapotter-hq/SnapOtter/security) |
| Analyse statique | CodeQL (JS/TS + Python) | Onglet [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), s'exécute chaque semaine + par PR |
| Examen des dépendances | GitHub natif | Vérification par PR, échoue sur les ajouts de haute gravité |
| Audit de dépendance Python | pip-audit | Journal d'exécution de CI à chaque poussée |
| Politique de sécurité | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) dans le référentiel |
| Mises à jour des dépendances | Dependabot | PR hebdomadaires automatisés pour npm, pip, Docker, actions |

**Exécuter votre propre analyse:**

Téléchargez le manifeste du sujet de la version et vérifiez qu'il a été attesté par le workflow de version :

```bash
gh attestation verify snapotter-v2.1.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Le manifeste enregistre `releaseTag`, `releaseCommit` et `workflowTriggerCommit` séparément. Vérifiez que `releaseCommit` est le commit décollé de la balise immuable, puis vérifiez le résumé SHA-256 de l'archive, de l'image, SBOM, ou l'analyse que vous consommez par rapport à son entrée dans `subjects`. Cette distinction est intentionnelle : l'extraction d'une validation de version nouvellement créée ne modifie pas l'identité de la validation dans les informations d'identification OIDC du workflow.

Vous pouvez également numériser un SBOM téléchargé ou l'image directement :

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.1.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.1.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.1.0
```

::: info
L'image SBOMs et les analyses reflètent l'image exacte spécifique à l'architecture publiée pour cette version. L'archive SBOMs et les analyses décrivent séparément l'archive prédéfinie. Les bundles de modèles AI installés après le déploiement ne sont pas inclus dans ces SBOMs car ils sont téléchargés au moment de l'exécution.
:::
