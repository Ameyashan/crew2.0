// The review banner injected on ATS pages. It renders inside a closed shadow
// root so the host page's CSS (line-heights, div/button resets, fonts) can't
// leak in and mangle it — styles live here, not in static/panel.css.

const HOST_ID = "jga-panel-host";

const STYLES = `
:host { all: initial; }
.panel {
  all: initial;
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483646;
  box-sizing: border-box;
  width: 340px;
  max-width: calc(100vw - 40px);
  display: block;
  background: #ffffff;
  color: #211e19;
  border: 1px solid #e3ddd0;
  border-radius: 14px;
  padding: 14px 16px 16px;
  font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  text-align: left;
  letter-spacing: normal;
  box-shadow: 0 12px 32px rgba(33, 30, 25, 0.16), 0 2px 6px rgba(33, 30, 25, 0.06);
  animation: jga-in 180ms ease-out;
}
@keyframes jga-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
* { box-sizing: border-box; }
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 8px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 7px;
  font: 500 10.5px/1 ui-monospace, "SFMono-Regular", Menlo, monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8b8171;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d9a13c;
}
.close {
  all: unset;
  cursor: pointer;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  color: #8b8171;
  font: 400 16px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.close:hover { background: #f7f4ec; color: #211e19; }
.title {
  display: block;
  margin: 0 0 4px;
  font: 500 17px/1.3 "Newsreader", Georgia, "Times New Roman", serif;
  color: #211e19;
}
.body { display: block; color: #6f6656; font-size: 13px; line-height: 1.5; }
.body > div { display: block; margin: 0; }
.body > div + div { margin-top: 4px; }
.body ul {
  display: block;
  margin: 8px 0 0;
  padding: 8px 10px 8px 26px;
  background: #fdf6e8;
  border: 1px solid #ecdfc0;
  border-radius: 8px;
  list-style: disc;
  color: #3a352c;
}
.body li { display: list-item; margin: 0; padding: 0; }
.body li:first-child { list-style: none; margin-left: -16px; color: #8a6d2f; font-weight: 500; }
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.btn {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  border-radius: 999px;
  background: #211e19;
  color: #faf8f3;
  font: 500 12.5px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  white-space: nowrap;
  text-decoration: none;
  transition: background 120ms ease;
}
.btn:hover { background: #3a352c; }
.btn:focus-visible, .close:focus-visible { outline: 2px solid #d9a13c; outline-offset: 2px; }
.btn.ghost {
  background: transparent;
  color: #211e19;
  border: 1px solid #b0a692;
}
.btn.ghost:hover { background: #f7f4ec; }
`;

export interface PanelAction {
  label: string;
  href?: string;
  onClick?: () => void;
  ghost?: boolean;
}

export function showPanel(opts: {
  title: string;
  bodyHtmlSafeLines?: string[];
  listItems?: string[];
  actions?: PanelAction[];
}): void {
  removePanel();
  const host = document.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = STYLES;
  root.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "status");

  const head = document.createElement("div");
  head.className = "head";
  const brand = document.createElement("div");
  brand.className = "brand";
  const dot = document.createElement("span");
  dot.className = "dot";
  brand.append(dot, "Jugaadu");
  const close = document.createElement("button");
  close.className = "close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  close.addEventListener("click", removePanel);
  head.append(brand, close);
  panel.appendChild(head);

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = opts.title;
  panel.appendChild(title);

  const body = document.createElement("div");
  body.className = "body";
  for (const line of opts.bodyHtmlSafeLines ?? []) {
    const p = document.createElement("div");
    p.textContent = line;
    body.appendChild(p);
  }
  if (opts.listItems?.length) {
    const ul = document.createElement("ul");
    for (const item of opts.listItems.slice(0, 6)) {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    }
    if (opts.listItems.length > 6) {
      const li = document.createElement("li");
      li.textContent = `…and ${opts.listItems.length - 6} more`;
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }
  panel.appendChild(body);

  if (opts.actions?.length) {
    const actions = document.createElement("div");
    actions.className = "actions";
    for (const a of opts.actions) {
      if (a.href) {
        const link = document.createElement("a");
        link.className = a.ghost ? "btn ghost" : "btn";
        link.textContent = a.label;
        link.href = a.href;
        link.target = "_blank";
        link.rel = "noreferrer";
        actions.appendChild(link);
      } else {
        const btn = document.createElement("button");
        btn.className = a.ghost ? "btn ghost" : "btn";
        btn.type = "button";
        btn.textContent = a.label;
        btn.addEventListener("click", () => a.onClick?.());
        actions.appendChild(btn);
      }
    }
    panel.appendChild(actions);
  }

  root.appendChild(panel);
  document.documentElement.appendChild(host);
}

export function removePanel(): void {
  document.getElementById(HOST_ID)?.remove();
}
