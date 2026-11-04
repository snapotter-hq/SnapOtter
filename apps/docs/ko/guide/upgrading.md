---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: 06c43a433aff
i18n_hash_version: 2
---
# 1.x에서 2.0으로 업그레이드 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x는 모든 것을 SQLite 파일 하나에 저장하고 컨테이너 하나로 실행했습니다. SnapOtter 2.0은 PostgreSQL과 Redis를 사용합니다. 이 가이드는 데이터를 잃지 않고 1.x 설치를 2.0으로 옮기는 방법을 안내합니다.

요약하면, 기존 `/data` 볼륨을 그대로 재사용하면 2.0이 첫 부팅 때 1.x 데이터베이스를 자동으로 가져옵니다. 사용자, 저장된 파일, 설정, API 키, 파이프라인이 모두 넘어옵니다. 이전 데이터베이스는 수정되지 않으므로 언제든 롤백할 수 있습니다.

::: tip 1.x 사용자분들께
많은 분들이 처음부터 SnapOtter를 믿고 써 주셨고, 여러분의 피드백이 이번 릴리스를 만들었습니다. 2.0은 내부적으로 많은 부분이 바뀌었으며, 이 가이드는 소중한 것을 하나도 잃지 않고 옮기실 수 있도록 마련했습니다. 계정, 파일, 설정, API 키, 파이프라인은 그대로 이어지고 이전 데이터베이스는 전혀 건드리지 않습니다. 함께 업그레이드해 주셔서 감사합니다.
:::

## 시작하기 전에: `/data` 볼륨 전체를 백업하세요 {#before-you-start-back-up-the-whole-data-volume}

매번 가장 먼저 이 작업을 하세요. `snapotter.db` 파일만이 아니라 `/data` 볼륨 **전체**를 백업하세요.

이유는 다음과 같습니다. 1.x는 SQLite를 WAL 모드로 실행하므로, 중지된 1.x 컨테이너에서는 커밋된 데이터 대부분이 거의 비어 있는 `snapotter.db` 옆의 `snapotter.db-wal`에 남아 있는 경우가 흔합니다. `snapotter.db`만 복사하면 빈 데이터베이스가 복사되어 모든 데이터가 조용히 사라집니다. 볼륨에는 `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm`, 그리고 `files/` 디렉터리가 함께 들어 있으며, 이들은 한 세트로 옮겨야 합니다.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## 먼저 1.17.2로 업그레이드하세요 {#upgrade-to-1-17-2-first}

2.0으로 옮기기 전에 1.x 설치를 최신 1.x 릴리스(1.17.2)로 업그레이드하세요. 그래야 1.x가 마지막 스키마 마이그레이션을 직접 실행하여, 2.0이 완전하고 알려진 스키마에서 가져올 수 있습니다. 더 오래된 1.x에서 곧바로 2.0으로 업그레이드하는 것은 지원되지 않습니다.

## 볼륨 이름 확인 {#check-your-volume-name}

가져오기 도구는 2.0 스택이 1.x 설치에서 사용하던 것과 같은 볼륨을 마운트해야만 데이터를 볼 수 있습니다. Docker 볼륨 이름은 대소문자를 구분하며, 이전 README 스니펫은 소문자 `snapotter-data`를 사용했지만 Compose 파일은 `SnapOtter-data`를 사용합니다. 어느 쪽인지 확인하세요.

```bash
docker volume ls | grep -i snapotter
```

2.0 구성에는 정확히 그 이름을 사용하세요.

## 방법 A: 단일 컨테이너 (가장 빠름) {#path-a-single-container-quickest}

SnapOtter를 단일 `docker run`로 실행하고 있다면 계속 그렇게 하세요. `DATABASE_URL` 또는 `REDIS_URL`를 설정하지 않으면 2.0이 컨테이너 안에서 내장 PostgreSQL과 Redis를 부팅하고, 첫 부팅 때 `/data/snapotter.db`를 자동으로 감지해 가져옵니다.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

로그에서 다음과 같은 줄이 나타나는지 확인하세요.

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

이것으로 끝입니다. 기존 자격 증명으로 로그인하세요.

## 방법 B: Compose (프로덕션 권장) {#path-b-compose-recommended-for-production}

2.0 Compose 스택은 서비스 세 개(앱, Postgres, Redis)를 실행합니다. 앱 서비스에 1.x `/data` 볼륨을 재사용하세요. 앱은 첫 부팅 때 `/data/snapotter.db`를 자동으로 감지해 Postgres로 가져옵니다.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

이전 데이터베이스를 명시적으로 지정하려면 `SQLITE_MIGRATE_PATH=/data/snapotter.db`를 설정하세요. 명시적 경로는 항상 자동 감지보다 우선합니다.

## 먼저 가져오기 미리 보기 (선택 사항) {#preview-the-import-first-optional}

아무것도 쓰지 않고 무엇이 가져와지는지 정확히 확인하려면 데이터베이스 파일에 대해 드라이 런을 실행하세요.

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

테이블별 행 수, 디스크에서 찾은 저장된 라이브러리 파일 수, 정규화될 작업 상태를 출력합니다. 실행 중인 Postgres는 필요하지 않습니다.

## 이어지는 것과 이어지지 않는 것 {#what-carries-over-and-what-does-not}

이어지는 것:

- 사용자와 로그인 기능. 비밀번호 해시는 그대로이므로 같은 사용자 이름과 비밀번호를 사용할 수 있습니다.
- 팀, 설정(인스턴스 ID 포함), 역할, API 키(계속 동작), 저장된 파이프라인.
- 작업 기록.
- 저장된 파일 라이브러리. `/data/files`가 볼륨에 보존되므로 기록과 실제 파일이 모두 이어집니다.

이어지지 않는 것:

- 로그인 세션. 업그레이드 후 모든 사용자가 한 번 다시 로그인해야 합니다. 자격 증명은 그대로이므로 다시 로그인하는 것이 전부입니다.
- 이전 처리 작업의 입력 및 출력 파일. 임시 작업 공간에 있던 파일이며 설계상 사라집니다. 작업 기록은 남습니다.
- 1.x의 사용자별 분석 동의 플래그. 2.0에는 대응하는 항목이 없습니다(2.0 분석은 인스턴스 수준 설정입니다).

## 가져오기 끄기 {#turning-the-import-off}

볼륨에 `snapotter.db`가 있더라도 일부러 새 데이터베이스를 사용하고 싶다면 `SQLITE_MIGRATE_PATH=off`를 설정하세요.

## 2.0 인스턴스에 이미 데이터가 있는 경우 {#if-you-already-have-data-in-the-2-0-instance}

가져오기 도구는 빈 데이터베이스에만 실행됩니다. 2.0을 새로 시작해 데이터를 만든 뒤 나중에 이전 `snapotter.db`를 마운트하면, 2.0은 그것을 감지하지만 가져오지는 않습니다. 두 데이터셋을 병합하면 ID가 충돌할 수 있기 때문입니다. 로그에 경고가 표시됩니다. 1.x 데이터를 가져오려면 빈 인스턴스가 필요합니다.

- 2.0 인스턴스에 기본 관리자만 있다면(실제로 사용하지 않았다면) 스택을 중지하고 Postgres 볼륨(`SnapOtter-pgdata`)을 제거한 다음, 이전 `/data`를 둔 상태에서 다시 부팅하세요. 깔끔하게 가져와집니다. 지워지는 것은 버려도 되는 Postgres 데이터뿐이며 1.x 데이터베이스는 그대로입니다.
- 2.0 인스턴스에 보관하려는 실제 데이터가 있다면 두 데이터셋을 자동으로 병합할 수 없습니다. 필요한 것을 내보낸 뒤 1.x 데이터를 별도의 새 배포로 가져오세요.

## 롤백 {#rolling-back}

업그레이드는 1.x `snapotter.db`를 수정하거나 삭제하지 않습니다. 1.x로 돌아가야 한다면 같은 볼륨에 대해 1.x 이미지를 다시 배포하세요. 업그레이드 후 2.0에서 만든 항목은 Postgres에 있으므로 1.x 데이터베이스에는 없습니다. 롤백할 생각이라면 서둘러 하세요.
