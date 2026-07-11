---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: 6f59925ff03c
---
# 1.x에서 2.0으로 업그레이드 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x는 모든 것을 단일 SQLite 파일에 저장하고 하나의 컨테이너로 실행되었습니다. SnapOtter 2.0은 PostgreSQL과 Redis를 사용합니다. 이 가이드는 데이터 손실 없이 1.x 설치를 2.0으로 옮기는 과정을 안내합니다.

짧게 요약하면: 기존 `/data` 볼륨을 재사용하면 2.0이 첫 부팅 시 1.x 데이터베이스를 자동으로 가져옵니다. 사용자, 저장된 파일, 설정, API 키, 파이프라인이 모두 넘어옵니다. 기존 데이터베이스는 절대 수정되지 않으므로 언제든 롤백할 수 있습니다.

::: tip 1.x 사용자분들께
많은 분들이 처음부터 SnapOtter를 신뢰해 주셨고, 여러분의 피드백이 이번 릴리스를 만들었습니다. 2.0은 내부적으로 많은 것을 바꾸며, 이 가이드는 여러분이 소중히 여기는 것을 잃지 않고 이전할 수 있도록 존재합니다. 계정, 파일, 설정, API 키, 파이프라인이 그대로 이어지며 기존 데이터베이스는 절대 건드리지 않습니다. 함께 업그레이드해 주셔서 감사합니다.
:::

## 시작하기 전에: `/data` 볼륨 전체를 백업하세요 {#before-you-start-back-up-the-whole-data-volume}

매번 이것을 먼저 하세요. `snapotter.db` 파일만이 아니라 `/data` 볼륨 **전체**를 백업하세요.

이유는 다음과 같습니다. 1.x는 SQLite를 WAL 모드로 실행하므로, 중지된 1.x 컨테이너는 커밋된 데이터 대부분을 거의 비어 있는 `snapotter.db` 옆의 `snapotter.db-wal`에 남겨 두는 경우가 흔합니다. `snapotter.db`만 복사하면 빈 데이터베이스를 담게 되어 조용히 모든 것을 잃습니다. 볼륨은 `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm`, 그리고 `files/` 디렉터리를 함께 담고 있으며, 이들은 하나의 세트로 이동해야 합니다.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## 먼저 1.17.2로 업그레이드하세요 {#upgrade-to-1-17-2-first}

2.0으로 옮기기 전에 1.x 설치를 최신 1.x 릴리스(1.17.2)로 업그레이드하세요. 그러면 1.x가 자체적으로 최종 스키마 마이그레이션을 실행하므로, 2.0이 알려진 완전한 스키마에서 가져올 수 있습니다. 오래된 1.x에서 곧바로 2.0으로 업그레이드하는 것은 지원되지 않습니다.

## 볼륨 이름 확인하기 {#check-your-volume-name}

임포터는 2.0 스택이 1.x 설치가 사용하던 것과 동일한 볼륨을 마운트할 때만 데이터를 인식합니다. Docker 볼륨 이름은 대소문자를 구분하며, 오래된 README 스니펫은 소문자 `snapotter-data`을 사용한 반면 Compose 파일은 `SnapOtter-data`을 사용합니다. 어느 쪽인지 확인하세요:

```bash
docker volume ls | grep -i snapotter
```

2.0 구성에서 정확히 그 이름을 사용하세요.

## 경로 A: 단일 컨테이너(가장 빠름) {#path-a-single-container-quickest}

SnapOtter를 단일 `docker run`로 실행하고 있다면 계속 그렇게 하세요. `DATABASE_URL`이나 `REDIS_URL`을 설정하지 않으면 2.0은 컨테이너 내부에 내장 PostgreSQL과 Redis를 부팅하며, 첫 부팅 시 `/data/snapotter.db`을 자동 감지해 가져옵니다.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

다음과 같은 로그 줄을 지켜보세요:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

그게 전부입니다. 기존 자격 증명으로 로그인하세요.

## 경로 B: Compose(프로덕션 권장) {#path-b-compose-recommended-for-production}

2.0 Compose 스택은 세 개의 서비스(앱, Postgres, Redis)를 실행합니다. 앱 서비스에는 1.x `/data` 볼륨을 재사용하세요. 앱은 `/data/snapotter.db`을 자동 감지해 첫 부팅 시 Postgres로 가져옵니다.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

기존 데이터베이스를 명시적으로 가리키고 싶다면 `SQLITE_MIGRATE_PATH=/data/snapotter.db`을 설정하세요. 명시적 경로는 항상 자동 감지보다 우선합니다.

## 먼저 임포트 미리보기(선택 사항) {#preview-the-import-first-optional}

아무것도 쓰지 않고 무엇이 가져와질지 정확히 확인하려면, 데이터베이스 파일에 대해 드라이 런을 실행하세요:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

테이블별 행 수, 디스크에서 찾은 저장 라이브러리 파일 개수, 정규화할 작업 상태를 출력합니다. Postgres가 실행 중일 필요가 없습니다.

## 넘어오는 것과 넘어오지 않는 것 {#what-carries-over-and-what-does-not}

넘어오는 것:

- 사용자 및 로그인 기능. 비밀번호 해시는 변경되지 않으므로 동일한 사용자 이름과 비밀번호가 그대로 작동합니다.
- 팀, 설정(인스턴스 정체성 포함), 역할, API 키(계속 작동), 저장된 파이프라인.
- 작업 이력 기록.
- 저장 파일 라이브러리, 기록과 실제 파일 모두. `/data/files`이 볼륨에 보존되기 때문입니다.

넘어오지 않는 것:

- 로그인 세션. 업그레이드 후 모두가 한 번 로그인합니다. 자격 증명은 변경되지 않으므로 단 한 번의 재로그인일 뿐이며 그 이상은 없습니다.
- 오래된 처리 작업의 입력 및 출력 파일. 이들은 임시 작업 공간에 있었고 설계상 사라집니다. 작업 이력 기록은 남습니다.
- 1.x의 사용자별 분석 동의 플래그. 2.0에는 대응하는 항목이 없습니다(2.0 분석은 인스턴스 수준 설정입니다).

## 임포트 끄기 {#turning-the-import-off}

볼륨에 `snapotter.db`이 있더라도 의도적으로 새 데이터베이스를 원한다면 `SQLITE_MIGRATE_PATH=off`을 설정하세요.

## 2.0 인스턴스에 이미 데이터가 있는 경우 {#if-you-already-have-data-in-the-2-0-instance}

임포터는 빈 데이터베이스에서만 실행됩니다. 2.0을 새로 시작해(데이터를 생성해) 나중에 오래된 `snapotter.db`을 마운트한 경우, 2.0은 이를 감지하지만 가져오지는 않습니다. 두 데이터셋을 병합하면 ID가 충돌할 수 있기 때문입니다. 로그에 경고가 표시됩니다. 1.x 데이터를 가져오려면 빈 인스턴스가 필요합니다:

- 2.0 인스턴스가 기본 관리자만 담고 있다면(실제로 사용하지 않았다면), 스택을 중지하고 Postgres 볼륨(`SnapOtter-pgdata`)을 제거한 뒤, 오래된 `/data`이 있는 상태로 다시 부팅하세요. 깔끔하게 가져옵니다. 이는 1.x 데이터베이스가 아니라 버려도 되는 Postgres 데이터만 지웁니다.
- 2.0 인스턴스가 유지하려는 실제 데이터를 담고 있다면 두 데이터셋을 자동 병합할 수 없습니다. 필요한 것을 내보내고 1.x 데이터를 별도의 새 배포로 가져오세요.

## 롤백하기 {#rolling-back}

업그레이드는 1.x `snapotter.db`을 절대 수정하거나 삭제하지 않습니다. 1.x로 되돌아가야 한다면 동일한 볼륨에 대해 1.x 이미지를 다시 배포하세요. 업그레이드 후 2.0에서 생성한 모든 것은 Postgres에 있어 1.x 데이터베이스에는 없으므로, 되돌릴 예정이라면 신속하게 롤백하세요.
