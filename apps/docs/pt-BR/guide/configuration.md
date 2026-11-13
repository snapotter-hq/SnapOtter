---
description: "Todas as variáveis de ambiente do SnapOtter com seus valores padrão. Configure autenticação, armazenamento, modelos de IA, análises e mais."
i18n_source_hash: caa895c0ba16
i18n_provenance: machine
i18n_output_hash: 9f26c72f7bbd
i18n_hash_version: 2
---

# Configuração {#configuration}

Toda a configuração é feita por meio de variáveis de ambiente. Cada variável tem um padrão razoável, então o SnapOtter funciona de imediato sem que você defina nenhuma delas.

## Variáveis de ambiente {#environment-variables}

### Servidor {#server}

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `1349` | Porta em que o servidor escuta. |
| `BASE_PATH` | (vazio) | Caminho público da implantação, por exemplo `/snapotter`. Vazio ou `/` serve na raiz do domínio. Aplicado em tempo de execução; não é preciso recompilar a imagem. |
| `RATE_LIMIT_PER_MIN` | `1000` | Máximo de requisições por minuto por IP. Defina como 0 para desativar o limite de taxa. |
| `CORS_ORIGIN` | (vazio) | Origens permitidas para CORS, separadas por vírgula, ou vazio para aceitar apenas a mesma origem. |
| `LOG_LEVEL` | `info` | Nível de detalhe dos logs. Um entre: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Quais peers podem definir o IP do cliente por meio de `X-Forwarded-For`. O padrão confia apenas em um peer de rede privada, então um proxy reverso em uma rede Docker ou LAN é confiável e o cabeçalho forjado de um cliente público não é. Defina `true` somente quando um proxy sob seu controle estiver à frente, em um endereço público. |

### Autenticação {#authentication}

Os dois booleanos abaixo aceitam apenas `true` e `false`. Qualquer outro valor, `1` ou `yes` ou `on`, falha na validação e o servidor encerra antes de começar a escutar.

| Variável | Padrão | Descrição |
|---|---|---|
| `AUTH_ENABLED` | `true` | Exige login. Defina como `false` para rodar sem nenhuma conta, o que concede direitos de administrador a toda requisição, então mantenha isso em uma rede confiável. |
| `DEFAULT_USERNAME` | `admin` | Nome de usuário da conta de administrador inicial. Usado apenas na primeira execução. |
| `DEFAULT_PASSWORD` | `admin` | Senha da conta de administrador inicial. Altere-a após o primeiro login. |
| `MAX_USERS` | `0` (ilimitado) | Número máximo de contas de usuário registradas. Defina como 0 para ilimitado. |
| `SESSION_DURATION_HOURS` | `168` | Duração da sessão de login em horas (o padrão é 7 dias). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Defina como `true` para pular o aviso obrigatório de troca de senha no primeiro login. |

### Armazenamento {#storage}

| Variável | Padrão | Descrição |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` ou `s3`. S3 e MinIO exigem uma licença com o recurso s3_storage, além das variáveis `S3_*` abaixo. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | String de conexão do PostgreSQL e a conexão pela qual toda requisição é atendida. Na versão 2.3.0 e posteriores, defina também `DATABASE_MIGRATION_URL` e esta passa a ser a função de execução com privilégio mínimo, com DML nas tabelas do app e nada além disso. A stack Compose a aponta para o serviço `postgres`; deixe-a sem definir (junto com `REDIS_URL`) para obter o modo embutido. |
| `DATABASE_MIGRATION_URL` | (vazio) | Conexão privilegiada, usada apenas durante a inicialização para executar migrações e conceder permissões à função de execução, e então fechada antes da primeira requisição. Deixe vazia e o SnapOtter roda com uma única função, com `DATABASE_URL` fazendo as duas tarefas. Veja [Funções com privilégio mínimo](/pt-BR/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | String de conexão do Redis (usada para as filas de jobs do BullMQ). O Compose a aponta para o serviço `redis`. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Diretório de arquivos temporários durante o processamento. Limpo automaticamente. A imagem define `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Diretório de arquivos persistentes do usuário (imagens enviadas, resultados salvos). A imagem define `/data/files`. |

### Armazenamento de objetos S3 {#s3-object-storage}

Lido apenas quando `STORAGE_MODE=s3`. Se faltar qualquer uma das três obrigatórias, a inicialização falha com o nome da variável omitida.

| Variável | Padrão | Descrição |
|---|---|---|
| `S3_BUCKET` | (vazio) | Bucket que guarda uploads e saídas. Obrigatório. |
| `S3_ACCESS_KEY_ID` | (vazio) | Chave de acesso. Obrigatória. No contêiner, você pode montá-la como arquivo, por meio de `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (vazio) | Chave secreta. Obrigatória. Mesma convenção de arquivo: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Região do bucket. |
| `S3_ENDPOINT` | (vazio) | Endpoint personalizado para MinIO, R2, Backblaze e outros armazenamentos compatíveis com S3. Vazio significa AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Defina como `true` para MinIO e qualquer outro serviço que queira `endpoint/bucket/key` em vez de endereçamento virtual-host. |
| `S3_PREFIX` | (vazio) | Prefixo de chave, para que um mesmo bucket possa abrigar várias instâncias. |

### Criptografia em repouso {#encryption-at-rest}

| Variável | Padrão | Descrição |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (vazio) | 64 caracteres hexadecimais (32 bytes). Criptografa configurações sensíveis armazenadas no banco de dados. Qualquer valor que não tenha 64 caracteres hexadecimais é rejeitado na inicialização. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (vazio) | A chave que você está substituindo, no mesmo formato. Defina as duas durante uma rotação para que as linhas existentes ainda sejam descriptografadas, e depois remova esta. |

### Modo embutido {#embedded-mode}

Execute a imagem sem `DATABASE_URL` e sem `REDIS_URL` e ela inicia o próprio PostgreSQL 17 e Redis dentro do contêiner, vinculados ao loopback, com todos os dados no volume `/data`. Isso restaura a experiência de um único comando `docker run` para início rápido, homelab e atualizações a partir da 1.x. É um caminho de conveniência, não uma implantação de produção: em produção, execute a stack Compose de 3 contêineres com PostgreSQL e Redis separados. O modo embutido exige executar o contêiner como root e é incompatível com runtimes de UID arbitrário (OpenShift, Kubernetes `runAsNonRoot`); use Compose nesses casos.

| Variável | Padrão | Descrição |
|---|---|---|
| `EMBEDDED` | `auto` | Ativado automaticamente quando `DATABASE_URL` e `REDIS_URL` não estão definidos. Defina como `0` para desativá-lo (o app então falha imediatamente se nenhum `DATABASE_URL`/`REDIS_URL` externo estiver definido, em vez de iniciar silenciosamente um banco de dados dentro do contêiner). |
| `REDIS_MAXMEMORY` | `512mb` | Limite de memória do Redis embutido (somente no modo embutido). Reduza em hosts com pouca memória, como um Raspberry Pi. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Segundos que a inicialização espera o Redis embutido responder a `PING` antes de desistir. Ao estourar o tempo, o contêiner para e registra o motivo, em vez de travar. Segundos inteiros de 1 a 999999; não há valor ilimitado, porque esperar para sempre é exatamente a falha que este limite existe para evitar. Aumente apenas se um host lento o atingir. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | O mesmo, para o PostgreSQL embutido. O relógio começa depois que o `initdb` do primeiro boot termina, então cobre a inicialização do servidor e a recuperação de falhas, e não a criação inicial do banco de dados. |

Atualizando da 1.x: coloque seu `snapotter.db` antigo em `/data/snapotter.db` no volume e o modo embutido o importa para o PostgreSQL embutido no primeiro boot. A importação roda uma vez; os boots seguintes a ignoram.

Nota sobre telemetria: o modo embutido herda o padrão de análises da imagem como qualquer outra configuração. A imagem publicada vem com as análises ativadas; compile com `--build-arg SNAPOTTER_ANALYTICS=off`, ou use a desativação pelo administrador no app, para desativá-las.

### Limites de processamento {#processing-limits}

| Variável | Padrão | Descrição |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (ilimitado) | Tamanho máximo de arquivo por upload, em megabytes. Defina como 0 para ilimitado. A imagem publicada vem com `0`; uma compilação a partir do código-fonte começa em 100. |
| `MAX_BATCH_SIZE` | `0` (ilimitado) | Número máximo de arquivos em uma única requisição em lote. Defina como 0 para ilimitado. A imagem publicada vem com `0`; uma compilação a partir do código-fonte começa em 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Número de jobs em lote executados em paralelo. Defina como 0 para detectar automaticamente com base nos núcleos de CPU disponíveis. |
| `MAX_MEGAPIXELS` | `0` (ilimitado) | Resolução máxima de imagem permitida, em megapixels. Defina como 0 para ilimitado. |
| `MAX_WORKER_THREADS` | `0` (auto) | Máximo de threads de trabalho para processamento de imagens. Defina como 0 para detectar automaticamente com base nos núcleos de CPU disponíveis. |
| `PROCESSING_TIMEOUT_S` | `0` (sem limite) | Tempo máximo de processamento por requisição, em segundos. Defina como 0 para não ter tempo limite. |
| `MAX_PIPELINE_STEPS` | `20` | Número máximo de etapas em um pipeline. Defina como 0 para não ter limite. |
| `MAX_CANVAS_PIXELS` | `0` (sem limite) | Tamanho máximo do canvas em pixels para imagens de saída. Defina como 0 para não ter limite. |
| `MAX_SVG_SIZE_MB` | `50` | Maior SVG aceito antes da sanitização, em megabytes. `0` se comporta de forma diferente aqui do que nas linhas ao redor. Ele remove por completo o limite de tamanho anterior à análise, em vez de elevá-lo, então deixe este definido. |
| `MAX_PDF_PAGES` | `0` (ilimitado) | Número máximo de páginas de PDF para a conversão de PDF em imagem. Defina como 0 para ilimitado. |

### Engines {#engines}

O SnapOtter procura cada binário de processamento em `$PATH` dentro do contêiner, então estas variáveis ficam vazias a menos que você monte uma compilação própria.

| Variável | Padrão | Descrição |
|---|---|---|
| `FFMPEG_PATH` | (vazio) | Caminho do binário `ffmpeg` por trás das ferramentas de vídeo e áudio. |
| `FFPROBE_PATH` | (vazio) | Caminho de `ffprobe`, que lê arquivos de mídia antes de serem processados. Aponte para a mesma compilação de `FFMPEG_PATH`. |
| `QPDF_PATH` | (vazio) | Caminho de `qpdf`, usado pelas ferramentas de PDF e para verificar PDFs enviados. |
| `SOFFICE_PATH` | (vazio) | Caminho do `soffice` do LibreOffice, usado nas conversões de documentos de escritório. |
| `PDFCPU_PATH` | (vazio) | Caminho de `pdfcpu`, usado por algumas ferramentas de PDF. |
| `SNAPOTTER_HW_ACCEL` | (vazio) | Família de codificadores de vídeo por hardware, `nvenc` ou `vaapi`. Vazio codifica por software. |

`SNAPOTTER_HW_ACCEL` exige um ffmpeg compilado com essa família de codificadores, e o ffmpeg da imagem não tem nenhuma das duas. Com o binário da própria imagem, a configuração recorre à codificação por software e avisa isso no log de inicialização. Para usá-la, monte sua própria compilação do ffmpeg, aponte `FFMPEG_PATH` e `FFPROBE_PATH` para ela e dê ao contêiner o dispositivo de GPU. Para `nvenc`, defina também `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`: a imagem pede apenas `compute,utility`, e sem `video` o runtime da NVIDIA não monta a biblioteca de codificação, então o codificador aparece na lista mas toda codificação falha. Um caminho de substituição que não existe ou não é executável também é citado no log de inicialização, e todo job que precisa desse binário falha até você corrigir o caminho ou removê-lo.

Os arquivos Compose publicados repassam as seis a partir de `.env`, então defini-las lá é suficiente.

### Limpeza {#cleanup}

| Variável | Padrão | Descrição |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Por quanto tempo os resultados de processamento não salvos (uploads brutos e saídas de ferramentas) são mantidos antes da exclusão automática. Os arquivos que você salva explicitamente na biblioteca de Arquivos não são afetados e persistem até você excluí-los. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Com que frequência o job de limpeza é executado. |

### Aparência {#appearance}

| Variável | Padrão | Descrição |
|---|---|---|
| `DEFAULT_THEME` | `light` | Tema padrão para novas sessões. `light`, `dark` ou `system`. |
| `DEFAULT_LOCALE` | `en` | Idioma padrão da interface. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Layout padrão das ferramentas. `sidebar` ou `fullscreen`. |

### Permissões do Docker {#docker-permissions}

| Variável | Padrão | Descrição |
|---|---|---|
| `PUID` | `999` | Executa o processo do contêiner com este UID. Defina de acordo com o usuário do host para bind mounts (`id -u`). |
| `PGID` | `999` | Executa o processo do contêiner com este GID. Defina de acordo com o grupo do host para bind mounts (`id -g`). |

## Exemplo com Docker {#docker-example}

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
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
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

A stack Docker Compose usa quatro volumes:

- `/data` (app) - Modelos de IA, venv do Python e arquivos do usuário. Monte-o para manter os arquivos enviados e os bundles de IA instalados entre reinicializações.
- `/tmp/workspace` (app) - Armazenamento temporário dos arquivos em processamento. Pode ser efêmero, mas montá-lo evita encher a camada gravável do contêiner.
- `SnapOtter-pgdata` (postgres) - Diretório de dados do PostgreSQL. Guarda todos os dados relacionais (usuários, configurações, pipelines, jobs, log de auditoria). Faça backup por meio de `pg_dump` ou de um snapshot do volume.
- `SnapOtter-redisdata` (redis) - Arquivo append-only do Redis para filas de jobs duráveis.
