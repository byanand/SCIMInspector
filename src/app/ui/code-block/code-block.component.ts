import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';

interface Token {
  text: string;
  cls: string;
}

// Keys, strings, literals, numbers, punctuation — one pass, in that order.
const TOKEN_RE = /("(?:\\.|[^"\\])*")(\s*:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?)|([{}[\],])/g;

/**
 * Read-only JSON with the design's syntax colours.
 *
 * This is for displaying a payload — a response body, a stored sample, a diff
 * pane. Monaco stays the editor wherever the user types JSON; loading it just
 * to render an immutable body would be a lot of weight for a `<pre>`.
 *
 * SCIM URNs get their own token colour, since a schema URN reads as an
 * identifier rather than as free text.
 */
@Component({
  selector: 'app-code-block',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <pre><code>@for (t of tokens(); track $index) {<span [class]="t.cls">{{ t.text }}</span>}</code></pre>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 0;
      }

      pre {
        margin: 0;
        height: 100%;
        padding: 13px 15px;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--code-bg);
        color: var(--code-ink);
        font-family: 'Roboto Mono', 'Cascadia Code', monospace;
        font-size: 11.5px;
        line-height: 1.6;
        overflow: auto;
        white-space: pre;
      }

      .k {
        color: var(--tok-key);
      }
      .s {
        color: var(--tok-str);
      }
      .n {
        color: var(--tok-num);
      }
      .b {
        color: var(--tok-bool);
      }
      .p {
        color: var(--tok-punc);
      }
      .u {
        color: var(--tok-urn);
      }
    `,
  ],
})
export class CodeBlockComponent {
  readonly code = input('');

  protected readonly tokens = computed<Token[]>(() => {
    const src = this.code();
    const out: Token[] = [];
    let last = 0;
    let m: RegExpExecArray | null;

    // exec() with /g advances lastIndex, so reset before each run.
    TOKEN_RE.lastIndex = 0;

    while ((m = TOKEN_RE.exec(src)) !== null) {
      if (m.index > last) {
        out.push({ text: src.slice(last, m.index), cls: '' });
      }

      let cls: string;
      if (m[1] && m[2]) cls = 'k';
      else if (m[1]) cls = /^"urn:/.test(m[1]) ? 'u' : 's';
      else if (m[3]) cls = 'b';
      else if (m[4]) cls = 'n';
      else cls = 'p';

      out.push({ text: m[0], cls });
      last = m.index + m[0].length;
    }

    if (last < src.length) {
      out.push({ text: src.slice(last), cls: '' });
    }
    return out;
  });
}
