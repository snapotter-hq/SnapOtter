---
description: "Guia de hardening de segurança do SnapOtter. Segurança de contêineres, isolamento de rede, Docker secrets, implantação em Kubernetes e artefatos de conformidade."
i18n_source_hash: 5cf773ddb4c0
i18n_provenance: machine
i18n_output_hash: f0bfc66d34be
i18n_hash_version: 2
---

# Segurança e hardening {#security-hardening}

O SnapOtter processa arquivos inteiramente na sua infraestrutura. Por padrão, ele envia analytics de produto anônimos e sem conteúdo, além de relatórios de falhas, para ajudar a melhorar o projeto. Ele nunca envia seus arquivos, nomes de arquivos, conteúdo de arquivos, saída de OCR, metadados de imagens nem texto de documentos. O feedback opcional só é enviado depois que um usuário o submete, apenas quando o analytics está ativado, e os campos de contato só são incluídos com consentimento explícito de contato. Um administrador pode desativar o analytics e a captura de feedback com um clique em Configurações > Sistema > Privacidade, sem necessidade de rebuild. O processamento de arquivos sempre permanece dentro do seu contêiner.

O contêiner roda como um usuário dedicado não root (`snapotter`), com todas as capabilities do Linux removidas, exceto o conjunto mínimo necessário. Para a política completa de divulgação de vulnerabilidades e a arquitetura de segurança, consulte o [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) no GitHub.

## Hardening do contêiner {#container-hardening}

Os arquivos Compose canônicos de [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) e [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) são a fonte de verdade. Não copie um exemplo resumido para produção; implante o arquivo da tag de release que você verificou.

As duas stacks aplicam os seguintes controles:

- Limites de memória, swap, CPU e PID contêm o processamento nativo descontrolado.
- Todo serviço remove todas as capabilities do Linux. O aplicativo readiciona apenas `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` para a propriedade dos volumes, a troca de identidade irreversível `gosu` e o repasse correto de sinais. O PostgreSQL e o Redis recebem apenas o subconjunto de que seus entrypoints oficiais precisam.
- `security_opt: [no-new-privileges:true]` impede que processos nos contêineres do aplicativo, do PostgreSQL e do Redis obtenham privilégios adicionais. Isso continua compatível com `gosu`: o entrypoint começa como root, prepara os volumes e só passa para o usuário dedicado `snapotter`.
- As entradas de imagem do PostgreSQL e do Redis são fixadas por digest. O aplicativo também deve ser fixado em uma tag de release ou digest verificado, em vez de `latest`.
- Verificações de integridade, rotação limitada de logs JSON, AOF durável do Redis e política de reinício são definidos de forma centralizada nos arquivos canônicos.

Em uma implantação exposta à internet, associe a porta 1349 ao loopback e encerre o TLS em um proxy reverso mantido. Gere credenciais únicas para o PostgreSQL e o Redis, guarde os segredos em arquivos protegidos ou em um gerenciador de segredos e altere imediatamente a senha inicial do administrador.

### Por que `read_only` não está definido {#why-read-only-is-not-set}

`read_only: true` não está definido porque o remapeamento de PUID/PGID grava em `/etc/passwd` e `/etc/group` na inicialização. Se você usa a flag `--user` do Docker ou `runAsUser` do Kubernetes em vez de PUID/PGID, pode ativar com segurança um sistema de arquivos raiz somente leitura.

## Isolamento de rede {#network-isolation}

O processamento de arquivos é local, mas uma instalação padrão **não é um sistema sem tráfego de saída**. Os analytics de produto anônimos usam o PostHog e o relatório de falhas usa o Sentry quando a telemetria está ativada. Defina `SNAPOTTER_TELEMETRY=0` (ou desative o analytics em Configurações > Sistema > Privacidade) para desligar ambos. O SnapOtter nunca inclui arquivos enviados, nomes de arquivos, saída de OCR, texto de documentos nem outros conteúdos de arquivos nesses eventos.

O restante do tráfego de saída depende de recursos: a instalação de bundles/modelos de IA baixa entradas de release assinadas; a importação por URL busca uma URL pública solicitada pelo usuário; e OIDC, SAML, OpenTelemetry, webhooks, armazenamento compatível com S3 ou integrações semelhantes configurados explicitamente contatam os destinos escolhidos pelo administrador. Os downloads de modelos em tempo de execução ficam desativados por padrão. Defina `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` somente para optar explicitamente pelos downloads de fallback automáticos. Uma [importação de bundle offline](/pt-BR/guide/deployment) pode provisionar os recursos de IA sem tráfego de saída de modelos em tempo de execução.

**Recomendações de firewall:**

| Cenário | Regra de saída |
|---|---|
| Air-gapped | Defina `SNAPOTTER_TELEMETRY=0` e `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, use a importação offline de bundles de IA, desative a importação por URL e as integrações externas e depois bloqueie a saída |
| Telemetria padrão | Permita os endpoints do PostHog e do Sentry listados nos logs do seu navegador/rede; desative a telemetria se a política não os permitir |
| Bundles de IA necessários | Durante a instalação, permita HTTPS para `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; depois bloqueie esses hosts |
| Integrações externas | Permita apenas os destinos exatos de OIDC/SAML/OTLP/webhook/armazenamento de objetos configurados pelo administrador |

Os arquivos de bundle são servidos pelo armazenamento Xet do Hugging Face, que transfere pelos endpoints `*.xethub.hf.co` em paralelo e é o que torna rápidos os downloads de bundles de vários GB. Se o seu firewall permite `huggingface.co` mas bloqueia `*.xethub.hf.co`, as instalações ainda funcionam, mas recorrem a um download mais lento em um único stream, então inclua os hosts do Xet na lista de permissões para continuar no caminho rápido. Instalações totalmente offline podem dispensar tudo isso e usar a [Importação de bundle offline](/pt-BR/guide/deployment).

Para a configuração de proxy reverso (Nginx, Traefik, Caddy, Cloudflare Tunnels), consulte o [guia de implantação](/pt-BR/guide/deployment#reverse-proxy).

## Docker Secrets {#docker-secrets}

Em implantações de produção, evite passar segredos como variáveis de ambiente em texto simples. O entrypoint oferece suporte à convenção `_FILE` do Docker: monte um segredo como arquivo e defina a variável `_FILE` correspondente com o caminho dele.

**Segredos compatíveis:**

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

O entrypoint detecta quando o contêiner já está rodando como não root (por exemplo, via `runAsUser` do Kubernetes) e ignora automaticamente a troca de privilégios do gosu. Nesse caso, ele não consegue executar chown nos volumes montados, então verifica se são graváveis e encerra cedo com orientações práticas caso não sejam. Consulte [Permissões de armazenamento](/pt-BR/guide/deployment#storage-permissions) para `fsGroup` e configurações com UID estrangeiro (TrueNAS, OpenShift).

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

Como `runAsUser: 999` é definido no nível do pod, o entrypoint ignora o gosu por completo. Isso permite as capabilities `allowPrivilegeEscalation: false` e `drop: [ALL]` sem conflito.

Para o dimensionamento de recursos, consulte [Requisitos de hardware](/pt-BR/guide/deployment#hardware-requirements).

## Backup e recuperação {#backup-and-recovery}

A stack Compose de produção define quatro volumes. Interrompa a entrada de tráfego e deixe as tarefas ativas terminarem antes de fazer um backup coordenado, para que o PostgreSQL, o Redis e o estado dos arquivos descrevam o mesmo ponto no tempo.

| Volume | Conteúdo | Tratamento na recuperação |
|---|---|---|
| `SnapOtter-pgdata` | Usuários, configurações, pipelines, tarefas, metadados de arquivos e log de auditoria do PostgreSQL | Crítico; use um dump lógico com falha rápida para recuperação portável |
| `SnapOtter-data` | Objetos salvos da biblioteca, logs e estado da IA (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Faça backup do volume inteiro; para economizar espaço, omita deliberadamente todo o estado da IA e reinstale os bundles |
| `SnapOtter-redisdata` | AOF do Redis para o estado durável das filas do BullMQ | Faça backup depois de pausar o app e forçar `SAVE`; necessário para retomar o trabalho enfileirado exatamente |
| `SnapOtter-workspace` | Chaves temporárias do armazenamento de objetos (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | Não faça backup depois que todas as tarefas forem esgotadas ou canceladas; nunca o descarte enquanto houver tarefas ativas |

O Compose normalmente prefixa os nomes dos volumes com o nome do projeto. Resolva o volume de origem real a partir do contêiner montado, em vez de presumir que um nome de exibição como `SnapOtter-data` seja o nome do volume do Docker.

### Backup do banco de dados {#database-backup}

Use o formato de arquivo personalizado do PostgreSQL e verifique o arquivo antes de considerar o backup concluído:

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

Teste cada backup restaurando-o em uma stack isolada, conferindo os registros do banco de dados e os checksums dos arquivos e iniciando o aplicativo. O `tests/qa/backup-restore-drill.sh` do repositório automatiza essa etapa de validação do release contra um `QA_IMAGE` explícito.

Se a sua plataforma fizer snapshots de volume consistentes em caso de falha, interrompa antes a stack inteira e faça o snapshot de todos os volumes críticos como um conjunto. Uma cópia bruta do diretório de dados do PostgreSQL feita a partir de um contêiner em execução não é um backup lógico compatível.

### Backup de arquivos e filas {#file-and-queue-backup}

Pause o aplicativo antes de capturar os volumes de arquivos e filas. Use `docker inspect` para resolver o nome real do volume, force o Redis a persistir o estado atual e arquive preservando propriedade e permissões:

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

Reinicie o Redis antes do aplicativo. Se você excluir `/data/ai` intencionalmente, remova toda a subárvore de IA em vez de preservar um registro de `installed.json` sem seus modelos ou ambiente virtual. Mantenha os arquivos de backup criptografados, com acesso controlado e separados do host que executa o SnapOtter.

## Artefatos de conformidade {#compliance-artifacts}

Cada release do SnapOtter inclui os seguintes artefatos de segurança:

| Artefato | Formato | Onde encontrar |
|---|---|---|
| Vínculo do assunto do release | JSON canônico + atestado do GitHub | Asset do [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| SBOM do arquivo | CycloneDX e SPDX JSON | Assets do release: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| SBOM da imagem | CycloneDX e SPDX JSON | Assets do release: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Varreduras de vulnerabilidades | Trivy JSON | Assets do release com prefixos `archive-linux-{arch}` ou `image-linux-{arch}` correspondentes |
| Varredura de vulnerabilidades | SARIF | Aba [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Análise estática | CodeQL (JS/TS + Python) | Aba [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), executado semanalmente + por PR |
| Revisão de dependências | Nativo do GitHub | Verificação por PR, falha em adições de alta severidade |
| Auditoria de dependências Python | pip-audit | Log de execução do CI a cada push |
| Política de segurança | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) no repositório |
| Atualizações de dependências | Dependabot | PRs semanais automatizados para npm, pip, Docker e Actions |

**Executando a sua própria varredura:**

Baixe o manifesto do assunto do release e verifique se ele foi atestado pelo workflow de release:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

O manifesto registra `releaseTag`, `releaseCommit` e `workflowTriggerCommit` separadamente. Verifique se `releaseCommit` é o commit obtido da tag imutável e, em seguida, verifique o digest SHA-256 do arquivo, da imagem, do SBOM ou da varredura que você consome contra a respectiva entrada em `subjects`. Essa distinção é intencional: fazer checkout de um commit de release recém-criado não altera a identidade do commit na credencial OIDC do workflow.

Você também pode varrer diretamente um SBOM baixado ou a imagem:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
Os SBOMs e as varreduras da imagem refletem a imagem exata, específica da arquitetura, publicada para aquele release. Os SBOMs e as varreduras do arquivo descrevem separadamente o arquivo pré-compilado. Os bundles de modelos de IA instalados após a implantação não estão incluídos nesses SBOMs, porque são baixados em tempo de execução.
:::
