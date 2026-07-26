---
description: "Todas as variáveis de ambiente do SnapOtter com valores padrão. Configure autenticação, armazenamento, modelos de IA, análise de dados e muito mais."
i18n_source_hash: 25970c776f7c
i18n_provenance: human
i18n_output_hash: bc726078e4af
i18n_hash_version: 2
---

# Configuração {#configuration}

Toda a configuração é feita por meio de variáveis de ambiente. Cada variável tem um padrão sensato, então o SnapOtter funciona imediatamente sem definir nenhuma delas.

## Variáveis de ambiente {#environment-variables}

### Servidor {#server}

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `1349` | Porta em que o servidor escuta. |
| `RATE_LIMIT_PER_MIN` | `1000` | Máximo de requisições por minuto por IP. Defina como 0 para desativar a limitação de taxa. |
| `CORS_ORIGIN` | (vazio) | Origens permitidas para CORS, separadas por vírgula, ou vazio para apenas a mesma origem. |
| `LOG_LEVEL` | `info` | Verbosidade do log. Um de: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Quais pares podem definir o IP do cliente por meio de `X-Forwarded-For`. O padrão acredita apenas em um par de rede privada, então um proxy reverso em uma rede Docker ou em uma LAN é confiável e o cabeçalho forjado de um cliente público não é. Defina `true` só quando um proxy sob seu controle estiver na frente, em um endereço público. |

### Autenticação {#authentication}

Os dois booleanos abaixo aceitam apenas `true` e `false`. Qualquer outra coisa, `1` ou `yes` ou `on`, falha na validação e o servidor encerra antes de começar a escutar.

| Variável | Padrão | Descrição |
|---|---|---|
| `AUTH_ENABLED` | `true` | Exige login. Defina como `false` para rodar sem conta nenhuma, o que dá direitos de admin a toda requisição, então mantenha isso em uma rede confiável. |
| `DEFAULT_USERNAME` | `admin` | Nome de usuário da conta de admin inicial. Usado apenas na primeira execução. |
| `DEFAULT_PASSWORD` | `admin` | Senha da conta de admin inicial. Altere-a após o primeiro login. |
| `MAX_USERS` | `0` (ilimitado) | Número máximo de contas de usuário registradas. Defina como 0 para ilimitado. |
| `SESSION_DURATION_HOURS` | `168` | Duração da sessão de login em horas (o padrão é 7 dias). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Defina como `true` para pular o prompt de troca de senha forçada no primeiro login. |

### Armazenamento {#storage}

| Variável | Padrão | Descrição |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` ou `s3`. S3 e MinIO precisam de uma licença com o recurso s3_storage, além das variáveis `S3_*` abaixo. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | String de conexão do PostgreSQL. A pilha Compose aponta isso para o serviço `postgres` dela; deixe indefinido (junto com `REDIS_URL`) para obter o modo embutido. |
| `REDIS_URL` | `redis://localhost:6379` | String de conexão do Redis (usada para as filas de jobs do BullMQ). O Compose aponta isso para o serviço `redis` dele. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Diretório para arquivos temporários durante o processamento. Limpo automaticamente. A imagem define `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Diretório para arquivos persistentes do usuário (imagens enviadas, resultados salvos). A imagem define `/data/files`. |

### Armazenamento de objetos S3 {#s3-object-storage}

Lido apenas quando `STORAGE_MODE=s3`. Se faltar qualquer uma das três obrigatórias, a inicialização falha informando o nome da variável que você deixou de fora.

| Variável | Padrão | Descrição |
|---|---|---|
| `S3_BUCKET` | (vazio) | Bucket que guarda os uploads e as saídas. Obrigatória. |
| `S3_ACCESS_KEY_ID` | (vazio) | Chave de acesso. Obrigatória. No contêiner, você pode montá-la em vez disso, via `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (vazio) | Chave secreta. Obrigatória. Mesma convenção de arquivo: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Região do bucket. |
| `S3_ENDPOINT` | (vazio) | Endpoint personalizado para MinIO, R2, Backblaze e outros armazenamentos compatíveis com S3. Vazio significa AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Defina como `true` para o MinIO e qualquer outro que espere `endpoint/bucket/key` em vez de endereçamento por virtual host. |
| `S3_PREFIX` | (vazio) | Prefixo de chave, para que um bucket possa guardar várias instâncias. |

### Criptografia em repouso {#encryption-at-rest}

| Variável | Padrão | Descrição |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (vazio) | 64 caracteres hexadecimais (32 bytes). Criptografa as configurações sensíveis armazenadas no banco de dados. Qualquer coisa que não tenha 64 caracteres hexadecimais é rejeitada na inicialização. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (vazio) | A chave da qual você está saindo na rotação, no mesmo formato. Defina as duas durante uma rotação para que as linhas existentes ainda sejam descriptografadas e depois remova esta. |

### Modo embutido {#embedded-mode}

Execute a imagem sem `DATABASE_URL` e sem `REDIS_URL` e ela inicia o seu próprio PostgreSQL 17 e Redis dentro do contêiner, vinculados ao loopback, com todos os dados no volume `/data`. Isso restaura a experiência de `docker run` de comando único para início rápido, homelab e atualizações a partir da 1.x. É um caminho de conveniência, não uma implantação de produção: para produção, execute a pilha Compose de 3 contêineres com PostgreSQL e Redis separados. O modo embutido requer executar o contêiner como root e é incompatível com runtimes de UID arbitrário (OpenShift, Kubernetes `runAsNonRoot`); use o Compose nesses casos.

| Variável | Padrão | Descrição |
|---|---|---|
| `EMBEDDED` | `auto` | Ativado automaticamente quando tanto `DATABASE_URL` quanto `REDIS_URL` estão indefinidos. Defina como `0` para desativá-lo (o app então falha imediatamente se nenhum `DATABASE_URL`/`REDIS_URL` externo estiver definido, em vez de iniciar silenciosamente um banco de dados dentro do contêiner). |
| `REDIS_MAXMEMORY` | `512mb` | Limite de memória para o Redis embutido (apenas no modo embutido). Reduza-o em hosts com restrição de memória, como um Raspberry Pi. |

Atualização a partir da 1.x: coloque seu antigo `snapotter.db` em `/data/snapotter.db` no volume e o modo embutido o importa para o PostgreSQL embutido no primeiro boot. A importação roda uma vez; os boots posteriores a ignoram.

Observação sobre telemetria: o modo embutido herda o padrão de análise de dados da imagem como qualquer outra configuração. A imagem publicada vem com a análise de dados ativada; compile com `--build-arg SNAPOTTER_ANALYTICS=off`, ou use a opção de desativação de admin dentro do app, para desligá-la.

### Limites de processamento {#processing-limits}

| Variável | Padrão | Descrição |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (ilimitado) | Tamanho máximo de arquivo por upload em megabytes. Defina como 0 para ilimitado. A imagem publicada vem com `0`; uma compilação a partir do código-fonte começa em 100. |
| `MAX_BATCH_SIZE` | `0` (ilimitado) | Número máximo de arquivos em uma única requisição em lote. Defina como 0 para ilimitado. A imagem publicada vem com `0`; uma compilação a partir do código-fonte começa em 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Número de jobs em lote que rodam em paralelo. Defina como 0 para detecção automática com base nos núcleos de CPU disponíveis. |
| `MAX_MEGAPIXELS` | `0` (ilimitado) | Resolução máxima de imagem permitida em megapixels. Defina como 0 para ilimitado. |
| `MAX_WORKER_THREADS` | `0` (auto) | Máximo de threads de trabalho para o processamento de imagem. Defina como 0 para detecção automática com base nos núcleos de CPU disponíveis. |
| `PROCESSING_TIMEOUT_S` | `0` (sem limite) | Tempo máximo de processamento por requisição em segundos. Defina como 0 para sem tempo limite. |
| `MAX_PIPELINE_STEPS` | `20` | Número máximo de etapas em um pipeline. Defina como 0 para sem limite. |
| `MAX_CANVAS_PIXELS` | `0` (sem limite) | Tamanho máximo de canvas em pixels para as imagens de saída. Defina como 0 para sem limite. |
| `MAX_SVG_SIZE_MB` | `50` | Maior SVG aceito antes da sanitização, em megabytes. `0` se comporta de forma diferente aqui em relação às linhas ao redor. Ele remove por completo o limite de tamanho aplicado antes da análise, em vez de aumentá-lo, então deixe esta definida. |
| `MAX_PDF_PAGES` | `0` (ilimitado) | Número máximo de páginas de PDF para a conversão de PDF para imagem. Defina como 0 para ilimitado. |

### Limpeza {#cleanup}

| Variável | Padrão | Descrição |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Por quanto tempo os resultados de processamento não salvos (uploads brutos e saídas de ferramentas) são mantidos antes da exclusão automática. Os arquivos que você salva explicitamente na biblioteca Files não são afetados e persistem até você excluí-los. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Com que frequência o job de limpeza roda. |

### Aparência {#appearance}

| Variável | Padrão | Descrição |
|---|---|---|
| `DEFAULT_THEME` | `light` | Tema padrão para novas sessões. `light`, `dark` ou `system`. |
| `DEFAULT_LOCALE` | `en` | Idioma padrão da interface. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Layout padrão das ferramentas. `sidebar` ou `fullscreen`. |

### Permissões do Docker {#docker-permissions}

| Variável | Padrão | Descrição |
|---|---|---|
| `PUID` | `999` | Executa o processo do contêiner com este UID. Defina para corresponder ao seu usuário do host em bind mounts (`id -u`). |
| `PGID` | `999` | Executa o processo do contêiner com este GID. Defina para corresponder ao seu grupo do host em bind mounts (`id -g`). |

## Exemplo de Docker {#docker-example}

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
      POSTGRES_PASSWORD: snapotter     # Altere isso para implantações não locais
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

A pilha Docker Compose usa quatro volumes:

- `/data` (app) - Modelos de IA, venv Python e arquivos do usuário. Monte-o para manter os arquivos enviados e os pacotes de IA instalados entre reinícios.
- `/tmp/workspace` (app) - Armazenamento temporário para arquivos em processamento. Isso pode ser efêmero, mas montá-lo evita encher a camada gravável do contêiner.
- `SnapOtter-pgdata` (postgres) - Diretório de dados do PostgreSQL. Isso guarda todos os dados relacionais (usuários, configurações, pipelines, jobs, log de auditoria). Faça backup via `pg_dump` ou snapshot de volume.
- `SnapOtter-redisdata` (redis) - Arquivo append-only do Redis para filas de jobs duráveis.
