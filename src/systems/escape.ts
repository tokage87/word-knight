// Shared HTML-escape helpers for systems/ overlays.
//
// Consolidation candidates: src/ui/WritingTask.ts, src/ui/CityOverlay.ts,
// src/ui/SkillTreeView.ts, src/ui/ListeningTask.ts, src/ui/ClozeTask.ts,
// and src/ui/ReadAloudTask.ts each carry their own local copies of these
// functions. Those files are owned by other agents; do not touch them here.

// Escape for text content positions (& < > only).
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Minimal HTML-attribute escape so strings with quotes or angle brackets
// can't break a `data-foo="…"` wrapper inlined via a template string.
// Moved from the local helper in SkillPicker.ts.
export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
