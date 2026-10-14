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

There is no backend, no API key, no account requirement and no automatic uploads. Data stays in your own browser's local storage unless you explicitly export a workspace file. Note that browser storage is *not* encrypted; avoid importing sensitive content on shared devices.

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
- [ ] **v0.3** OpenAI / Anthropic / Ollama adapter prototypes (available API events only)
- [ ] **v0.4** User-provided ChatGPT/Claude conversation export importers, with consent and redaction
- [ ] **v0.5** Search at scale, layouts, filters, replay history, graph diff
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
