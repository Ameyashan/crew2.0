// The review banner injected on ATS pages (styles in static/panel.css).

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
  const panel = document.createElement("div");
  panel.id = "jga-panel";

  const close = document.createElement("button");
  close.className = "jga-close";
  close.textContent = "×";
  close.addEventListener("click", removePanel);
  panel.appendChild(close);

  const title = document.createElement("div");
  title.className = "jga-title";
  title.textContent = opts.title;
  panel.appendChild(title);

  const body = document.createElement("div");
  body.className = "jga-body";
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
    actions.className = "jga-actions";
    for (const a of opts.actions) {
      if (a.href) {
        const link = document.createElement("a");
        link.className = "jga-btn";
        link.textContent = a.label;
        link.href = a.href;
        link.target = "_blank";
        link.rel = "noreferrer";
        actions.appendChild(link);
      } else {
        const btn = document.createElement("button");
        if (a.ghost) btn.className = "jga-ghost";
        btn.textContent = a.label;
        btn.addEventListener("click", () => a.onClick?.());
        actions.appendChild(btn);
      }
    }
    panel.appendChild(actions);
  }

  document.documentElement.appendChild(panel);
}

export function removePanel(): void {
  document.getElementById("jga-panel")?.remove();
}
