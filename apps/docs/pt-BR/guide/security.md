---
description: "Guia de reforço de segurança para o SnapOtter. Segurança de contêiner, isolamento de rede, Docker secrets, implantação em Kubernetes e artefatos de conformidade."
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: 11ea27a4455a
---

# Segurança e Reforço {#security-hardening}

O SnapOtter processa arquivos inteiramente na sua infraestrutura. Por padrão, ele envia análises de produto anônimas, sem conteúdo, e relatórios de falhas para ajudar a melhorar o projeto. Ele nunca envia seus arquivos, nomes de arquivos, conteúdos de arquivos, saída de OCR, metadados de imagem ou texto de documentos. O feedback opcional é enviado apenas depois que um usuário o submete, apenas quando as análises estão habilitadas, e os campos de contato são incluídos apenas com consentimento explícito de contato. Um administrador pode desativar a captura de análises e feedback com um clique em Configurações > Sistema > Privacidade, sem necessidade de reconstruir a imagem. O processamento de arquivos sempre permanece dentro do seu contêiner.

O contêiner é executado como um usuário dedicado sem privilégios de root (`snapotter`) com todas as capacidades do Linux descartadas, exceto o conjunto mínimo necessário. Para a política completa de divulgação de vulnerabilidades e a arquitetura de segurança, consulte [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) no GitHub.

## Reforço do Contêiner {#container-hardening}

O [docker-compose.yml padrão](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) inclui reforço de segurança para produção. Aqui está uma explicação de cada opção e por que ela importa:

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

### Por que `no-new-privileges` Não Está Definido {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` é intencionalmente omitido. O entrypoint inicia como root para corrigir a propriedade dos volumes e, em seguida, faz o downgrade para o usuário `snapotter` via [gosu](https://github.com/tianon/gosu), o que requer setuid. Assim que o rebaixamento de privilégios é concluído, o processo é executado como `snapotter` com todas as capacidades removidas, exceto as cinco listadas acima.

Se você usar o Kubernetes ou a flag `--user` do Docker para executar diretamente como não-root (ignorando o gosu), é seguro habilitar `no-new-privileges`.

### Por que `read_only` Não Está Definido {#why-read-only-is-not-set}

`read_only: true` não está definido porque o remapeamento de PUID/PGID grava em `/etc/passwd` e `/etc/group` na inicialização. Se você usar a flag `--user` do Docker ou o `runAsUser` do Kubernetes em vez de PUID/PGID, você pode habilitar com segurança um sistema de arquivos raiz somente leitura.

## Isolamento de Rede {#network-isolation}

Durante a operação normal, o contêiner não faz **nenhuma conexão de rede de saída**. Todo o processamento de arquivos acontece localmente usando bibliotecas empacotadas.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

A única exceção são os **downloads de modelos de IA**: quando um usuário instala um pacote de recurso de IA pela interface, o contêiner baixa arquivos de modelo do GitHub Releases e do PyPI. Esses downloads acontecem uma vez por pacote e são armazenados no volume `/data`.

**Recomendações de firewall:**

| Cenário | Regra de saída |
|---|---|
| Air-gapped (sem IA) | Bloqueie todo o tráfego de saída do contêiner |
| Pacotes de IA necessários | Permita HTTPS para `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` durante a instalação e depois bloqueie |
| Após a instalação da IA | Bloqueie todo o tráfego de saída, os modelos ficam em cache localmente |

Para a configuração de proxy reverso (Nginx, Traefik, Caddy, Cloudflare Tunnels), consulte o [Guia de implantação](/pt-BR/guide/deployment#reverse-proxy).

## Docker Secrets {#docker-secrets}

Em implantações de produção, evite passar segredos como variáveis de ambiente em texto simples. O entrypoint suporta a convenção `_FILE` do Docker: monte um segredo como arquivo e defina a variável `_FILE` correspondente com o caminho dele.

**Segredos suportados:**

| Variável | Equivalente `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Exemplo com secrets do Docker Compose:**

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
Os secrets do Docker Compose (sem Swarm) exigem o Compose v2.23 ou posterior.
:::

## Implantação em Kubernetes {#kubernetes-deployment}

O entrypoint detecta quando o contêiner já está sendo executado como não-root (por exemplo, via `runAsUser` do Kubernetes) e pula o rebaixamento de privilégios do gosu automaticamente. Nesse caso, ele não consegue fazer chown dos volumes montados por conta própria, então verifica se eles são graváveis e encerra antecipadamente com orientações acionáveis, caso não sejam. Consulte [Permissões de armazenamento](/pt-BR/guide/deployment#storage-permissions) para configurações `fsGroup` e de UID externo (TrueNAS, OpenShift).

**SecurityContext de Pod recomendado:**

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

Como `runAsUser: 999` é definido no nível do pod, o entrypoint pula o gosu inteiramente. Isso permite as capacidades `allowPrivilegeEscalation: false` e `drop: [ALL]` sem conflito.

Para o dimensionamento de recursos, consulte [Requisitos de Hardware](/pt-BR/guide/deployment#hardware-requirements).

## Backup e Recuperação {#backup-and-recovery}

O estado persistente é dividido em dois volumes:

| Volume | Conteúdo | Crítico? |
|---|---|---|
| `SnapOtter-pgdata` | Banco de dados PostgreSQL (usuários, configurações, pipelines, jobs, log de auditoria) | Sim |
| `/data` (volume do app) | Arquivos enviados por usuários, modelos de IA, venv do Python | Parcialmente (veja abaixo) |

Dentro do volume `/data`:

| Caminho | Conteúdo | Crítico? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Arquivos de usuário e resultados de processamento | Sim |
| `/data/ai/` | Arquivos de modelo de IA baixados | Não (podem ser baixados novamente) |
| `/data/venv/` | Ambiente virtual do Python | Não (reconstruído na inicialização) |

### Backup do banco de dados {#database-backup}

Use `pg_dump` para fazer backup do banco de dados enquanto a stack está em execução:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Como alternativa, pare a stack e faça um snapshot do volume `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Backup dos arquivos de usuário {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

Os modelos de IA somam até cerca de 24 GB no total, considerando todos os pacotes. Como podem ser baixados novamente, exclua `/data/ai/` e `/data/venv/` dos backups para economizar espaço. Apenas o banco de dados e os arquivos de usuário são críticos.

## Artefatos de Conformidade {#compliance-artifacts}

Cada release do SnapOtter inclui os seguintes artefatos de segurança:

| Artefato | Formato | Onde encontrar |
|---|---|---|
| SBOM (CycloneDX) | JSON | Asset da [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Asset da [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| Verificação de vulnerabilidades | JSON do Trivy | Asset da [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| Verificação de vulnerabilidades | SARIF | Aba [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Análise estática | CodeQL (JS/TS + Python) | Aba [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), executa semanalmente + por PR |
| Revisão de dependências | Nativa do GitHub | Verificação por PR, falha em adições de alta severidade |
| Auditoria de dependências Python | pip-audit | Log de execução do CI em cada push |
| Política de segurança | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) no repositório |
| Atualizações de dependências | Dependabot | PRs automatizados semanais para npm, pip, Docker, Actions |

**Executando sua própria verificação:**

Baixe o SBOM da release e verifique-o com a ferramenta de sua preferência:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
O SBOM e a verificação de vulnerabilidades refletem a imagem exata publicada para aquela release. Os pacotes de modelos de IA instalados após a implantação não estão incluídos no SBOM, pois são baixados em tempo de execução.
:::
