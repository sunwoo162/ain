# MindTrace

**Explore observable AI activity as an evidence graph.** A local-first, Obsidian-inspired open-source workspace for tracing prompts, tools, retrieval, memory, source documents, generated answers, and human annotations.

> **Important:** MindTrace cannot read a model's private hidden thoughts. `observed` means an integration recorded an event; it does **not** mean the model relied on that event while reasoning. Demo data is synthetic.

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
- [ ] **v0.2** SDK and collector protocol for directly instrumented agents
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
