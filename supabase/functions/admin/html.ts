// Escaping by construction. Every dynamic value that reaches the page goes through html``, which
// escapes it unless it is already markup built by html`` itself. There is no other way to put
// text into the page, so a value from the database (a caption, a comment, a username, a note)
// cannot become markup.

export class Raw {
  constructor(readonly s: string) {}
  toString(): string {
    return this.s;
  }
}

export function esc(v: unknown): string {
  return String(v).replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" })[c] as string);
}

function render(v: unknown): string {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join("");
  if (v === null || v === undefined || v === false) return "";
  return esc(v);
}

/** Tagged template: interpolations are escaped; nested html`` and arrays of it are kept. */
export function html(strings: TemplateStringsArray, ...vals: unknown[]): Raw {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + strings[i + 1];
  return new Raw(out);
}

/** Markup that is a fixed string in this source, never data. */
export function trusted(s: string): Raw {
  return new Raw(s);
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
