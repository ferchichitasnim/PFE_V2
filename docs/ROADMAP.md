# PBIXRay MCP Server Roadmap (Current)

This roadmap reflects the current state after integrating MCP as the semantic data gateway for runtime context extraction.

---

## 1) Completed Milestones

- [x] MCP server (`src/pbixray_server.py`) exposes core semantic tools.
- [x] Flask + Next.js local copilot stack is operational.
- [x] Storytelling and DAX generation flows run against local Ollama.
- [x] Project structure reorganization completed (`src/`, `tests/`, `examples/`, `docs/`).
- [x] Baseline docs/install/contribution files exist.
- [x] Runtime context extraction in Flask is MCP-driven (`contextSource: "mcp"`).

---

## 2) In Progress / Hardening

- [ ] Stabilize MCP output normalization layer (all tool output formats).
- [ ] Improve timeout/retry behavior for MCP session startup and tool calls.
- [ ] Reduce repeated process startup overhead (consider persistent MCP session/pool).
- [ ] Expand/validate documentation payload fidelity for all PBIX variants.
- [ ] Add explicit user-visible diagnostics for `contextSource` and MCP errors.

---

## 3) Next Priority Work

## 3.1 Quality and correctness

- [ ] Add semantic payload validation tests (tables/schema/relationships/measures consistency).
- [ ] Add regression tests for Story, DAX, and Documentation payload shape.
- [ ] Add golden-test fixtures for predictable documentation output.

## 3.2 DAX and documentation improvements

- [ ] Improve DAX prompt grounding from schema + relationship metadata.
- [ ] Add clearer business-friendly documentation sections.
- [ ] Add optional lineage and dependency visual summaries.

## 3.3 Operability

- [ ] Add structured logs with request IDs across UI/Flask/MCP.
- [ ] Add health endpoints and startup diagnostics.
- [ ] Document troubleshooting playbook for common local failures.

---

## 4) Medium-Term Goals

- [ ] Make MCP usage first-class for all semantic retrieval paths (including any remaining legacy flows).
- [ ] Add integration tests for multiple MCP clients.
- [ ] Add CI pipeline for lint/test/docs checks.
- [ ] Package and version server releases more formally.

---

## 5) Backlog / Future Considerations

- [ ] Support additional PBIX analysis capabilities as PBIXRay evolves.
- [ ] Add richer governance/security metadata support where available.
- [ ] Evaluate performance optimization for large PBIX models.
- [ ] Provide optional enterprise deployment profile (non-dev runtime setup).

---

## 6) Notes

- This roadmap is execution-focused and should be updated as checkboxes move.
- Use `docs/PROJECT_DOCUMENTATION.md` as architecture truth source and keep this file action-oriented.
