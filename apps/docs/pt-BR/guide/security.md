---
description: "Guia de hardening de segurança para o SnapOtter. Segurança de contêineres, isolamento de rede, Docker secrets, implantação em Kubernetes e artefatos de conformidade."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: 1639c7483bb1
i18n_hash_version: 2
---

# Segurança e Hardening {#security-hardening}

O SnapOtter processa arquivos inteiramente na sua infraestrutura. Ele envia analytics de produto e relatórios de falha anônimos e sem conteúdo por padrão, para ajudar a melhorar o projeto. Ele nunca envia seus arquivos, nomes de arquivos, conteúdos de arquivos, saída de OCR, metadados de imagem ou texto de documento. O feedback opcional é enviado apenas depois que um usuário o submete, apenas quando os analytics estão habilitados, e os campos de contato são incluídos somente com consentimento de contato explícito. Um administrador pode desativar a captura de analytics e feedback em um clique em Configurações > Sistema > Privacidade, sem necessidade de rebuild. O processamento de arquivos sempre permanece dentro do seu contêiner.

O contêiner roda como um usuário dedicado não-root (`snapotter`) com todas as capabilities do Linux removidas, exceto o conjunto mínimo necessário. Para a política completa de divulgação de vulnerabilidades e a arquitetura de segurança, veja [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) no GitHub.

## Endurecimento de contêineres {#container-hardening}

Os arquivos canônicos [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) e [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) Compose são a fonte da verdade. Não copie um exemplo abreviado para produção; implante o arquivo da tag de lançamento que você verificou.

Ambas as pilhas aplicam os seguintes controles:

- Os limites de memória, swap, CPU e PID contêm processamento nativo descontrolado.
- Cada serviço elimina todos os recursos do Linux. O aplicativo adiciona de volta apenas `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` para propriedade de volume, queda de identidade `gosu` unidirecional e encaminhamento de sinal elegante. PostgreSQL e Redis recebem apenas o subconjunto necessário para seus pontos de entrada oficiais.
- `security_opt: [no-new-privileges:true]` evita que processos no aplicativo, PostgreSQL e contêineres Redis obtenham privilégios adicionais. Isso permanece compatível com `gosu`: o ponto de entrada começa como root, prepara os volumes e passa apenas para o usuário `snapotter` dedicado.
- As entradas de imagem PostgreSQL e Redis são fixadas pelo resumo. O aplicativo também deve ser fixado em uma tag de lançamento verificada ou resumo, em vez de `latest`.
- Verificações de integridade, rotação de log JSON limitada, Redis AOF durável e política de reinicialização são definidas centralmente nos arquivos canônicos.

Para uma implantação voltada para a Internet, vincule a porta 1349 ao loopback e encerre o TLS em um proxy reverso mantido. Gere credenciais exclusivas do PostgreSQL e Redis, armazene segredos em arquivos protegidos ou em um gerenciador de segredos e altere a senha inicial do administrador imediatamente.

### Por que `read_only` não está definido como {#why-read-only-is-not-set}

`read_only: true` não está definido porque o remapeamento PUID/PGID grava em `/etc/passwd` e `/etc/group` na inicialização. Se você usar o sinalizador `--user` do Docker ou Kubernetes `runAsUser` em vez de PUID/PGID, poderá ativar com segurança um sistema de arquivos raiz somente leitura.

## Isolamento de rede {#network-isolation}

O processamento de arquivos é local, mas uma instalação padrão **não é um sistema livre de saída**. A análise anônima de produtos usa PostHog e os relatórios de falhas usam Sentry quando a telemetria está habilitada. Defina `SNAPOTTER_TELEMETRY=0` (ou desative a análise em Configurações > Sistema > Privacidade) para desligar ambos. SnapOtter nunca inclui arquivos carregados, nomes de arquivos, saída de OCR, texto de documento ou outro conteúdo de arquivo nesses eventos.

Outro tráfego de saída é orientado por recursos: instalação de pacote/modelo de IA baixa entradas de liberação assinadas; A importação de URL busca um URL público solicitado pelo usuário; e OIDC, SAML, OpenTelemetry, webhooks, armazenamento compatível com S3 ou integrações semelhantes configurados explicitamente entram em contato com os destinos escolhidos pelo administrador. Os downloads de modelos em tempo de execução são desativados por padrão. Defina `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` somente para ativar explicitamente os downloads automáticos de fallback. Uma [importação de pacote off-line](/pt-BR/guide/deployment) pode provisionar recursos de IA sem saída do modelo de tempo de execução.

**Recomendações de firewall:**

|Cenário|Regra de saída|
|---|---|
|Sem ar|Defina `SNAPOTTER_TELEMETRY=0` e `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, use a importação de pacote de IA off-line, desative a importação de URL e integrações externas e, em seguida, bloqueie a saída|
|Telemetria padrão|Permita os endpoints PostHog e Sentry listados pelos registros do seu navegador/rede; desativar a telemetria se a política não permitir|
|Pacotes de IA necessários|Durante a instalação, permita HTTPS para `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; então bloqueie esses hosts|
|Integrações externas|Permitir apenas os destinos OIDC/SAML/OTLP/webhook/armazenamento de objetos exatos configurados pelo administrador|

Os arquivos de pacotes são servidos a partir do armazenamento Xet do Hugging Face, que é transferido pelos endpoints `*.xethub.hf.co` em paralelo e é o que torna rápidos os downloads de pacotes de vários GB. Se o seu firewall permitir `huggingface.co`, mas bloquear `*.xethub.hf.co`, as instalações ainda serão bem-sucedidas, mas voltarão para um download de fluxo único mais lento, portanto, coloque os hosts Xet na lista de permissões para permanecer no caminho rápido. Instalações totalmente off-line podem ignorar tudo isso e usar [Importação de pacote off-line](/pt-BR/guide/deployment).

Para configuração de proxy reverso (Nginx, Traefik, Caddy, Cloudflare Tunnels), consulte o [Guia de implantação](/pt-BR/guide/deployment#reverse-proxy).

## Docker Secrets {#docker-secrets}

Para implantações em produção, evite passar segredos como variáveis de ambiente em texto plano. O entrypoint oferece suporte à convenção `_FILE` do Docker: monte um segredo como um arquivo e defina a variável `_FILE` correspondente para o caminho dele.

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

O entrypoint detecta quando o contêiner já está rodando como não-root (por exemplo, via `runAsUser` do Kubernetes) e pula a mudança de privilégio do gosu automaticamente. Nesse caso, ele não consegue fazer chown dos volumes montados por conta própria, então verifica se eles são graváveis e sai cedo com orientação acionável se não forem — veja [Permissões de armazenamento](/pt-BR/guide/deployment#storage-permissions) para `fsGroup` e configurações de UID estrangeiro (TrueNAS, OpenShift).

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

Como `runAsUser: 999` é definido no nível do pod, o entrypoint pula o gosu por completo. Isso permite as capabilities `allowPrivilegeEscalation: false` e `drop: [ALL]` sem conflito.

Para o dimensionamento de recursos, veja [Requisitos de Hardware](/pt-BR/guide/deployment#hardware-requirements).

## Backup e recuperação {#backup-and-recovery}

A pilha de produção do Compose define quatro volumes. Interrompa a entrada e deixe os trabalhos ativos terminarem antes de fazer um backup coordenado para que o PostgreSQL, o Redis e o estado do arquivo descrevam o mesmo momento.

|Volume|Conteúdo|Tratamento de recuperação|
|---|---|---|
|`SnapOtter-pgdata`|Usuários, configurações, pipelines, trabalhos, metadados de arquivos e log de auditoria do PostgreSQL|Crítico; use um dump lógico rápido para recuperação portátil|
|`SnapOtter-data`|Objetos de biblioteca salvos, logs e estado de IA (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|Faça backup de todo o volume; para economizar espaço, omitir deliberadamente todo o estado da IA ​​e reinstalar seus pacotes|
|`SnapOtter-redisdata`|Redis AOF para estado de fila BullMQ durável|Faça backup após pausar o aplicativo e forçar `SAVE`; necessário para retomar o trabalho na fila exatamente|
|`SnapOtter-workspace`|Chaves temporárias de armazenamento de objetos (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|Não faça backup depois que todos os trabalhos forem esgotados ou cancelados; nunca descarte-o enquanto os trabalhos estiverem ativos|

O Compose normalmente prefixa os nomes dos volumes com o nome do projeto. Resolva o volume de origem real do contêiner montado em vez de assumir que um nome de exibição como `SnapOtter-data` é o nome do volume do Docker.

### Backup do banco de dados {#database-backup}

Use o formato de arquivo personalizado do PostgreSQL e verifique o arquivo antes de considerar o backup completo:

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

Teste cada backup restaurando-o em uma pilha isolada, verificando os registros do banco de dados e as somas de verificação dos arquivos e iniciando o aplicativo. O `tests/qa/backup-restore-drill.sh` do repositório automatiza esse portão de liberação em relação a um `QA_IMAGE` explícito.

Se, em vez disso, sua plataforma tirar snapshots de volumes consistentes com falhas, interrompa a pilha inteira primeiro e faça snapshots de todos os volumes críticos como um conjunto. Uma cópia bruta do diretório de dados PostgreSQL de um contêiner em execução não é um backup lógico compatível.

### Backup de arquivos e filas {#file-and-queue-backup}

Pause o aplicativo antes de capturar volumes de arquivos e filas. Use `docker inspect` para resolver o nome real do volume, forçar o Redis a persistir em seu estado atual e arquivar com propriedade e permissões preservadas:

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

Reinicie o Redis antes do aplicativo. Se você excluir `/data/ai` intencionalmente, remova toda a subárvore AI em vez de preservar um registro `installed.json` sem seus modelos ou ambiente virtual. Mantenha os arquivos de backup criptografados, com acesso controlado e separados do host que executa o SnapOtter.

## Artefatos de conformidade {#compliance-artifacts}

Cada versão SnapOtter inclui os seguintes artefatos de segurança:

| Artefato | Formatar | Onde encontrar |
|---|---|---|
| Liberar vinculação de assunto | Atestado canônico JSON + GitHub | [Lançamento GitHub](https://github.com/snapotter-hq/SnapOtter/releases) ativo: `snapotter-v{version}-release-subjects.json` |
| Arquivo SBOM | CycloneDX e SPDX JSON | Liberar ativos: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Imagem SBOM | CycloneDX e SPDX JSON | Liberar ativos: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Verificações de vulnerabilidade | Trivy JSON | Liberar ativos com prefixos `archive-linux-{arch}` ou `image-linux-{arch}` correspondentes |
| Verificação de vulnerabilidade | SARIF | Guia [Segurança GitHub](https://github.com/snapotter-hq/SnapOtter/security) |
| Análise estática | CodeQL (JS/TS + Python) | Guia [Segurança GitHub](https://github.com/snapotter-hq/SnapOtter/security), executada semanalmente + por PR |
| Revisão de dependência | GitHub nativo | Verificação por PR, falha em adições de alta gravidade |
| Auditoria de dependência Python | pip-audit | Log de execução do CI em cada push |
| Política de segurança | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) no repositório |
| Atualizações de dependência | Dependabot | PRs semanais automatizados para npm, pip, Docker, Actions |

**Executando sua própria verificação:**

Baixe o manifesto do assunto do lançamento e verifique se ele foi atestado pelo fluxo de trabalho do lançamento:

```bash
gh attestation verify snapotter-v2.1.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

O manifesto registra `releaseTag`, `releaseCommit` e `workflowTriggerCommit` separadamente. Verifique se `releaseCommit` é o commit retirado da tag imutável e, em seguida, verifique o resumo SHA-256 do arquivo, imagem, SBOM ou varredura que você consome em relação à sua entrada em `subjects`. Essa distinção é intencional: o check-out de um commit de versão recém-criado não altera a identidade do commit na credencial OIDC do fluxo de trabalho.

Você também pode digitalizar um SBOM baixado ou a imagem diretamente:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.1.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.1.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.1.0
```

::: info
A imagem SBOMs e as varreduras refletem a imagem exata específica da arquitetura publicada para essa versão. O arquivo SBOMs e as varreduras descrevem o arquivo pré-construído separadamente. Os pacotes configuráveis ​​do modelo AI instalados após a implementação não são incluídos nestes SBOMs porque são baixados no tempo de execução.
:::
