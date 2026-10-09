# Shortcut

A social video app where people respond to prompts with short videos and talk back with video replies. The product is global; the closed beta is seeded in Canggu.

## What's here

| Path | What it is |
|---|---|
| `CLAUDE.md` | Rules Claude Code follows in this repo. It reads this file automatically. |
| `SPEC.md` | The locked v1 product and build spec (rev 110, 5 Oct 2026), exported from the online doc. |
| `design/BOARDS.md` | Index of the 86 approved A1 Native boards, by row, with the canvas notes. |
| `design/boards/` | A render of every board (`<ID>.jpg`). |
| `design/html/` | Static board markup: exact copy, colours and sizes. A reference, not app code. |
| `prompts/` | The prompt to give Claude Code for each phase. Only phase 1 exists so far. |
| `docs/DECISIONS.md` | Gate decisions and the decision log. |

The online masters are the [spec doc](https://claude.ai/code/artifact/eee59791-f711-4dac-bc44-d24dfaae2018) and the [design canvas](https://claude.ai/artifact/AUxUiU1muSm6Z61SP2wCUP). If either changes, re-export it here.

## Status

Phase 1's video spike ran on a real iPhone; its Android run is outstanding. Phases 2 to 7 are implemented and await real-device verification. The current state, the open gates and the rules are in `CLAUDE.md`; everything still open before the beta is in `docs/BETA-READINESS.md`.

`prompts/PHASE-1-video-spike.md` is kept as the record of the spike. Don't rerun it; the outstanding Android run uses `spike/CHECKLIST.md` (`spike/REPORT.md` Section 8).
