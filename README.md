# 의심암귀 (疑心暗鬼) — MindTrace

**믿기 전에, 근거를 추적하라.** AI의 실제 실행 이벤트와 기록된 출처를 연결해 탐색하는 오픈소스 관계망입니다.

**English codename: MindTrace · Brand: 의심암귀 (UISIM)**

Explore observable AI activity as an evidence graph. A local-first, Obsidian-inspired open-source workspace for tracing prompts, tools, retrieval, memory, source documents, generated answers, and human annotations.

> **Important:** MindTrace cannot read a model's private hidden thoughts. `observed` means an integration recorded an event; it does **not** mean the model relied on that event while reasoning. Demo data is synthetic.

## 주요 화면 경험

- 우주 관측소 스타일의 로컬 우선 그래프, 노드와 관계의 출처 구분
- 노드 선택 후 **전체 / 1단계 / 2단계 / 3단계** 관계 렌즈 탐색
- 실제 기록된 관계만 표시하며 자동으로 추측 연결을 생성하지 않음
- **몰입 보기(Immersive)** 및 `Ctrl/⌘+K` 검색
- **25개 노드 / 28개 관계**의 합성 데모 시나리오 3개 (실제 AI 기록 아님)

## 새로운 기능 — 기록 경로 탐색(V0.4)

- 두 노드 사이에서 **실제 존재하는 연결만** 따라 최단 경로 표시. `observed` 관계만 보기 지원
- 선택 노드·경로의 주변 영역 강조, 경로가 없는 경우 명확한 알림
- 대형 그래프의 최대 600노드 / 1,800관계 렌더링 예산과 생략 수 알림
- Cytoscape 재사용 및 증분 갱신으로 선택/수집 시 그래프 재생성 감소
- 자세한 내용: [V0.4 개발 문서](docs/recorded-paths.md)

## V0.6 — 스트리밍 메타데이터 및 시간 이벤트

- OpenAI / Claude **SSE**, Ollama **NDJSON** 응답을 변형하지 않고 전달
- 요청·첫 청크 수신·완료/실패 시점을 실제 시간으로 기록하고 토큰 사용량은 최종 메타데이터에서만 추출
- 기록된 노드의 최신 48개를 **시간순 이벤트 타임라인**에서 확인하고 클릭하면 그래프에서 선택
- 모의 스트림 예제: `npm run demo:stream`
- 연동 설명: [스트리밍 및 타임라인 가이드](docs/streaming.md)

## V0.5 — 실제 AI API 이벤트 연동

- **OpenAI Responses / Claude Messages / 로컬 Ollama Chat** 비스트리밍 호출 관측
- 원문·API 키·도구 인자 대신 모델 ID, HTTP 응답 시간, 토큰 수, 도구 요청 건수만 전송
- 수집기는 `127.0.0.1`에만 바인딩, 수집 오류가 실제 API 응답을 방해하지 않음
- API별 호출 수는 그래프 상단에서 확인하고 제공자별 탐색 가능
- 사용법 및 제한: [제공자별 연동 가이드](docs/providers.md)

## Features — v0.1

- Interactive Cytoscape graph with node selection, neighborhood highlighting, zoom, pan and fit-to-screen
- Node search with one-hop context, category filters, and a browsable node library
- Inspector with descriptions, evidence provenance, timestamps, sources and backlinks
- Event timeline / graph replay; filters both nodes and relationships by recorded timestamp
- Add personal notes and manual connections without mislabeling them as observed events
- JSON import/export with schema validation and browser-local persistence (`localStorage`)
- Responsive dark interface and synthetic demo workspace

## Run locally

Requires Node.js 22.10+.

```bash
npm install
npm run dev
```

Open the address printed by Vite. To validate changes:

```bash
npm run test
npm run typecheck
npm run build
```

기본 그래프 UI는 별도 서버·API 키·계정 없이 실행됩니다. **Live connect 및 제공자 이벤트 관측은 선택 사항**이며, 직접 로컬 수집기와 AI 제공자에 연결해야 합니다. 데이터를 자동으로 외부 업로드하지 않지만 실제 AI API를 호출하면 요청은 해당 제공자에게 전달됩니다. 그래프/수집기 저장 데이터는 암호화되어 있지 않습니다.

## Evidence model

MindTrace's schema has four explicit provenance levels:

| Level | Meaning | Display |
| --- | --- | --- |
| `observed` | Directly recorded event from an integration | solid relationship |
| `reported` | Model/provider/external source reported information | dashed relationship |
| `inferred` | Derived or suspected relationship; not directly verified | dashed relationship |
| `manual` | Human-authored note or connection | dotted relationship |

Each node has `{ id, kind, label, detail, createdAt, source, evidence }`. Each edge has `{ id, source, target, kind, createdAt, evidence }`. `source` and `target` reference valid node IDs. Node kinds are `prompt`, `model`, `document`, `memory`, `tool`, `reasoning-summary`, `answer`, `note`, `error`. Events may be ingested in a future SDK, but v0.1 only imports validated workspace JSON.

Example `workspace.json`:

```json
{
  "schemaVersion": 1,
  "id": "example",
  "name": "Example",
  "description": "An example local evidence graph",
  "isDemo": false,
  "nodes": [
    { "id": "q1", "kind": "prompt", "label": "Why slow?", "detail": "User request", "createdAt": "2026-01-01T00:00:00.000Z", "source": "my-app", "evidence": "observed" },
    { "id": "a1", "kind": "answer", "label": "Measure query latency", "detail": "Final response", "createdAt": "2026-01-01T00:00:01.000Z", "source": "my-app", "evidence": "observed" }
  ],
  "edges": [
    { "id": "e1", "source": "q1", "target": "a1", "kind": "produced", "createdAt": "2026-01-01T00:00:01.000Z", "evidence": "observed" }
  ]
}
```

JSON import is limited to 2 MB. The UI caps workspaces to 10,000 nodes / 30,000 edges; practical rendering performance depends on device capacity. JSON should be from trusted sources: imported labels and descriptions are rendered as text, not HTML.

## Roadmap

- [x] **v0.1** Local interactive evidence graph, import/export, annotations, replay
- [x] **v0.2 (기초)** 루프백 수집기·토큰 인증·SDK·2초 폴링 연동 (추가 어댑터는 아직 미구현)
- [x] **V0.5 (기초)** OpenAI / Anthropic / Ollama 비스트리밍 메타데이터 어댑터와 수집기 연동
- [ ] **후속** ChatGPT/Claude 사용자가 제공한 대화 내보내기 파일 가져오기 (동의·비식별화 포함)
- [ ] **후속** 대규모 검색 최적화, 그래프 클러스터링 및 그래프 버전 간 비교
- [ ] **v1.0** Plugin API, stable versioned schema, public documentation and benchmarking

## Repository conventions

- Branches: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `refactor/<topic>`, `test/<topic>`
- Commits and PR titles: `<type>: <concise description>` (Conventional Commits)
- Allowed types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`
- Feature work targets `main` through PRs; don't commit directly to `main` except repository initialization
- Every PR includes **Summary**, **Changes**, **Verification**, **Evidence / limits**, and **Checklist**.
- A PR is merged only after test, typecheck, build and human review.

## License

MIT — see [LICENSE](LICENSE).

## 로컬 AI 실행 이벤트 실시간 연결 (v0.2)

자체 AI 애플리케이션의 **명시적으로 기록된 이벤트**를 로컬 수집기에 전달하고 웹 그래프에서 볼 수 있습니다.

1. PowerShell에서 `$env:MINDTRACE_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))"`로 토큰 설정
2. 같은 터미널에서 `npm run collector` 실행 (기본 주소 `http://127.0.0.1:4318`)
3. 다른 터미널에서 `npm run dev` 실행 후 웹의 **Live connect**에서 주소·토큰 입력
4. 토큰을 설정한 별도 터미널에서 `npm run demo:trace` 실행 → 그래프에 예시 실행 기록 표시

자세한 API, 보안 설정, SDK 사용법은 [로컬 수집기 안내](docs/collector.md)를 참고하세요. 토큰은 브라우저 저장소에 남기지 않습니다. 그래프 데이터는 로컬 저장소에 남으므로 공용 기기에서는 주의하세요.
