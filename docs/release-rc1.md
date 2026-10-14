# 의심암귀 V1.0 RC1 — 통합 검증 / 릴리스 후보

**상태: Release Candidate (검증용), 정식 1.0 출시 아님**

## 설치 및 첫 실행 (Node.js 22.10+)

```bash
git clone https://github.com/sunwoo162/ain.git
cd ain
git switch release/v1.0.0-rc1
npm install
npm run dev
```

브라우저에서 표시된 로컬 주소로 접속합니다. **계정과 API 키가 없어도 합성 데모를 사용할 수 있습니다.** 처음 열면 '그래프 탐험하기 / 로컬 수집기 연결 / AI 연동 방법' 안내가 나타나며 다시 보려면 상단의 '시작 가이드'를 누릅니다.

### 실제 로컬 실행 이벤트 연결 (제공자 API 키 불필요)

첫 번째 셸에서 인증 토큰을 설정하고 수집기를 시작합니다. 토큰을 Git에 커밋하거나 공개 로그에 붙이지 마세요.

```powershell
$env:MINDTRACE_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))"
npm run collector
```

다른 셸에서 웹 앱을 실행하고 수집기 주소 `http://127.0.0.1:4318` 및 같은 토큰으로 **Live connect**를 누릅니다. 세 번째 셸에서 같은 인증 토큰을 환경 변수로 지정한 뒤:

```powershell
npm run demo:trace
npm run demo:stream
```

두 데모는 로컬 수집기 연결을 점검하기 위한 예시입니다. `demo:trace`와 `demo:stream`의 실행 방식은 각각 `docs/collector.md`, `docs/streaming.md`도 참고하세요.

**주의:** 연결을 승인하면 현재 브라우저 워크스페이스가 로컬 수집기 데이터로 바뀝니다. 필요한 기록이 있으면 먼저 JSON으로 내보내세요. 수집기 파일은 기본 `.mindtrace/collector.json`에 저장되며 암호화되어 있지 않습니다.

## 종합 검증 명령

```bash
npm run test
npm run smoke:release
npm run typecheck
npm run build
npm run test:browser
npm run bench:graph
```

CI에서 Chromium 자동 브라우저 테스트는 첫 사용 안내, 전체 UI, 키보드 탐색, 로컬 수집기 실제 HTTP 호출, 화면 갱신 및 재로드까지 검사합니다. 합성 벤치마크는 실제 브라우저 FPS가 아닌 Node.js CPU 사용량입니다.

## RC1에서 확인하는 것

- 첫 실행 안내가 나오며, 닫힌 상태가 유지되고 언제든 다시 열 수 있는가
- 데모 표시가 **실제 AI 실행 기록으로 오인되지 않는가**
- 로컬 수집기→SDK→실제 HTTP 이벤트→브라우저 그래프 갱신 경로가 통과하는가
- 인증 없는 조회가 401, 허가되지 않은 웹 Origin이 403, 대용량 전송이 413으로 차단되는가
- 이벤트를 재전송해도 중복 생성되지 않고 서버 재시작 후 그래프가 유지되는가
- 브라우저 재로드 후 로컬 데이터가 보존되는가
- 기존 그래프, 경로, 미니맵, 검색, 타임라인, 실행 ID 그룹 기능이 회귀하지 않는가
- TypeScript·빌드·데스크톱·모바일 Chromium UI 테스트가 모두 통과하는가

## 보안 및 실제 제약

- 기본적으로 **루프백 HTTP**(`127.0.0.1`), Bearer 토큰, CORS Origin 허용 목록을 사용합니다. 인터넷에 직접 노출하거나 운영 서비스에 프록시하지 마세요.
- 그래프와 저장 파일은 **암호화하지 않습니다**. 민감한 프롬프트 원문·도구 인자·키를 이벤트 `label/detail/source`에 직접 전달하지 않도록 해야 합니다. SDK가 사용자가 직접 작성한 내용까지 자동 비식별화하지는 않습니다.
- OpenAI·Claude·Ollama 제공자 어댑터는 기본 메타데이터 관측을 위해 준비했으나 **실제 제공자 API 키를 쓴 E2E 검증은 별도 단계**입니다. 해당 API 호출은 사용 요금이 발생할 수 있습니다.
- 모델의 비공개 사고, 숨겨진 추론은 수집하거나 재생하지 않습니다. 관계선은 데이터에 명시된 연결만 나타냅니다.
- 10,000노드 합성 Node 벤치마크가 통과해도 실제 브라우저의 모바일 FPS나 장시간 힙 안정성까지 증명하지는 않습니다.
- 기존 Draft PR #1 및 #5~#13은 통합 PR #14로 대체되어 **미병합 상태로 종료**했습니다. 모든 기존 PR 커밋이 RC1 조상임을 Git 비교로 검증했습니다. 현재 열린 PR은 **#14 하나**이며, 대상 브랜치는 `main`이지만 아직 병합하지 않았습니다.

## 통합 PR 상태 (2026-10-15)
- **PR #14:** [V1.0 RC1 전체 통합](https://github.com/sunwoo162/ain/pull/14) — 대상 `main`, Draft, 아직 병합하지 않음
- 마지막으로 확인된 CI 통과: [38652293160](https://github.com/sunwoo162/ain/actions/runs/38652293160) (문서·워크플로 변경 이후에는 해당 최신 커밋도 다시 검증)
- 기존 PR 10개가 모두 현재 RC1 브랜치의 조상이며 누락된 커밋은 없습니다.
- **의존성 잠금 파일은 아직 저장소에 고정되지 않았습니다.** CI에서 생성되는 `package-lock.json`를 확보해 재현성 검증이 필요합니다. 이것은 정식 릴리스 전 개선 항목입니다.

## 실제 Ollama 검증 절차 (사용자의 로컬 환경)

1. Ollama를 설치하고 `ollama pull llama3.2`로 사용할 모델을 준비합니다.
2. 첫 터미널에서 `MINDTRACE_TOKEN`을 설정하여 `npm run collector`를 실행하고, 둘째 터미널에서 `npm run dev`로 웹 UI를 켭니다.
3. 의심암귀의 Live connect에 수집기 주소와 토큰을 입력합니다.
4. 셋째 터미널에서 같은 수집기 토큰과 `OLLAMA_MODEL=llama3.2`를 설정한 뒤 `node examples/observe-providers.mjs ollama`를 실행합니다.
5. 웹에서 Ollama 실행 이벤트가 실제로 추가되는지 확인하고, API 키·원문·숨겨진 추론이 수집되지 않았는지 검토합니다.

모델 다운로드는 네트워크·디스크 용량이 필요하므로 **실제 모델 호출은 자동 CI에서 수행하지 않습니다**.

## 정식 V1.0 전 릴리스 차단 조건

- [x] 통합 PR을 `main` 대상으로 변경한 커밋의 테스트·빌드·브라우저 E2E 통과: [GitHub Actions](https://github.com/sunwoo162/ain/actions/runs/38652293160)
- [ ] 실제 Ollama 1회 이상 정상 호출 및 실제 그래프 동기화 수동 검증
- [ ] 실기기에서 데스크톱·모바일 키보드/스크린리더 및 인터랙션 확인
- [ ] 대형 10,000노드 브라우저 CPU·FPS·메모리 기준 측정과 이슈 검토
- [ ] 개인정보·토큰 취급 및 수집기 로컬 파일 권한에 대한 인간 리뷰 (기본 자동 401/403/413/파일 모드 검사는 통과)
- [x] PR #1 및 #5~#13을 PR #14로 통합하고, 각 기존 PR에 안내 문구 추가 후 종료 (이력 보존, 미병합)
- [ ] 버전 고정용 lockfile 추가 및 재현 가능한 설치 확인
- [ ] 릴리스 승인 후에만 `main` 병합, `v1.0.0` 태그, 첫 배포

RC1은 테스트를 통과해도 자동으로 정식 릴리스하지 않습니다.
