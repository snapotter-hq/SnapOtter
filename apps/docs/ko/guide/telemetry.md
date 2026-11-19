---
description: "SnapOtter가 수집하는 익명 사용 데이터, 전송 시점, 첫 실행 시 선택 방식, 그리고 인스턴스 전체의 제품 분석을 끄는 방법을 설명합니다."
i18n_source_hash: 784b2a0c06eb
i18n_provenance: machine
i18n_output_hash: 5ab31074ac19
i18n_hash_version: 2
---

# SnapOtter가 수집하는 정보 {#what-snapotter-collects}

Anonymous Product Analytics는 관리자가 인스턴스 전체에 대해 설정합니다. 새 인스턴스는 첫 실행 시 이를 묻고, 누군가 응답하기 전까지는 아무것도 전송하지 않습니다. 언제든 Settings > System > Privacy에서 변경할 수 있습니다.

분석이 켜져 있으면 SnapOtter는 PostHog에 어떤 도구와 파이프라인이 실행되었는지, 소요 시간, 성공 여부, 오류 코드, 파일 수를 보내며, 인스턴스의 익명 ID, 버전, CPU 아키텍처, 운영 체제, 설치 유형, GPU 보유 여부도 함께 보냅니다. 오류 보고서는 파일 이름, 경로, 이메일, 따옴표로 묶인 값을 제거한 상태로 Sentry에 전송됩니다. 파일 자체, 파일 이름이나 경로, 파일 내용, OCR 출력이나 추출된 텍스트, 이미지 메타데이터, 계정 정보는 절대 보내지 않습니다. 전송 대상은 PostHog와 Sentry 두 곳뿐이며, 분석을 끄면 두 곳 모두에 아무것도 보내지 않습니다.

## 첫 실행 시 선택 {#first-run-choice}

관리자가 새 인스턴스를 처음 열면 SnapOtter가 다음과 같이 묻습니다. "익명 사용 통계와 오류 보고서를 보낼까요? 파일은 절대 전송되지 않습니다." 두 응답은 동등하며 어느 쪽도 미리 선택되어 있지 않습니다. 응답하지 않고 창을 닫으면 분석은 꺼진 상태로 유지되고 다음 방문 때 다시 묻습니다. 관리자에게만 표시됩니다. `AUTH_ENABLED=false`에서는 계정이 없고 로컬 사용자가 관리자 역할을 하므로, 앱을 여는 사람이 응답합니다. 데스크톱 앱도 같은 방식으로 묻습니다.

이 질문이 생기기 전부터 실행 중이던 인스턴스에는 묻지 않습니다. 기존 분석 설정을 그대로 유지하며, 관리자나 `SNAPOTTER_ANALYTICS_DEFAULT=off`이 끄지 않았다면 켜진 상태입니다.

## 전송하는 이벤트(활성화된 경우) {#events-we-send-when-enabled}

- tool_used: 도구 id, 상태, 소요 시간, 카테고리, AI 도구 여부, 실패 시 오류 코드, 한 단계를 따로 보고하는 도구의 단계 이름(Passport Photo의 분석 단계).
- pipeline_executed: 단계 수, 도구 id, 배치 플래그, 파일 수, 소요 시간, 상태.
- ai_bundle_action: 번들 id, 작업 (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment`, `imported`), 소요 시간, 설치에 실패한 경우 고정 목록의 실패 범주 (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout`, `other`). 설치 프로그램 출력, 경로, 오류 메시지는 전송되지 않습니다.
- 프런트엔드 사용: 어떤 도구 페이지가 열리는지, 추가된 파일(개수만), 도구 시작, 다운로드, 저장, 검색(결과 수만), 배치 처리.
- 크래시 리포트: 오류 유형, 민감 정보가 제거된 오류 메시지(파일 이름, 경로, 이메일, 따옴표로 묶인 값 제거), 파일 기본 이름이 포함된 소스 스택, 그리고 AI 도구의 경우 파일 기본 이름만 포함된 Python 트레이스백.

## 절대 수집하지 않는 정보 {#what-we-never-collect}

- 파일 이름 또는 경로
- 파일 내용
- OCR 출력 텍스트
- 이미지 메타데이터(EXIF)
- 추출된 문서 텍스트
- 계정 정보

PostHog는 모든 서버와 마찬가지로 각 요청이 들어온 IP 주소를 확인합니다. 당사의 PostHog 프로젝트는 이를 저장하지 않고 폐기하며, SnapOtter 자체 서버 이벤트는 그 자리에 자리 표시자를 보냅니다.

## 업데이트 알림 {#update-notices}

분석이 켜져 있는 동안 서버는 몇 시간마다 인스턴스의 익명 ID와 버전을 사용해 PostHog에 가장 최신 SnapOtter 릴리스가 무엇인지 묻습니다. 더 새로운 릴리스가 있으면 관리자에게 릴리스 노트 링크가 포함된 알림이 표시됩니다. 알림을 닫으면 다음 릴리스까지 숨겨집니다. 대신 설치되거나 다운로드되는 것은 없으며, 분석이 꺼져 있으면 서버는 묻지 않습니다.

## 끄는 방법 {#turning-it-off}

관리자: Settings > System > Privacy에서 "Anonymous Product Analytics"를 끄세요. 인스턴스 전체에서 즉시 중단됩니다. 데이터를 절대 보낼 수 없는 이미지를 빌드하려면 `SNAPOTTER_ANALYTICS=off` 빌드 인수를 설정하세요. 서버 환경에 `SNAPOTTER_TELEMETRY=off`을 설정하면 런타임에 같은 효과가 있으며, 앱에 저장된 어떤 응답보다 우선합니다.

첫 실행 질문에 미리 답하려면 서버를 처음 부팅하기 전에 서버 환경에 `SNAPOTTER_ANALYTICS_DEFAULT=off`(또는 `on`)를 추가하세요. 그러면 아무에게도 묻지 않습니다. Docker Compose에서는 앱 서비스의 `environment:` 아래에 넣으세요. `.env`에만 설정하면 컨테이너에 전달되지 않습니다.
