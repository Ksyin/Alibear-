import {
  auth,
  database,
  ref,
  get,
  update,
  onAuthStateChanged,
  authenticatedRequest,
  isAdmin,
  adminStatus,
  signOut,
} from "/firebase-client.js";

const params = new URLSearchParams(location.search);
const editing = params.get("edit") === "1";
const fileName = location.pathname.split("/").pop() || "index.html";
const page =
  fileName.replace(/\.html$/, "") === "index"
    ? "home"
    : fileName.replace(/\.html$/, "");
const ROOTS = "#site-header,#site-footer,main";
const HEX = /^#[0-9a-f]{6}$/i;
let sectionsData = {};

const slug = (value) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90) || "text";
function rootKey(node) {
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node,
    root = element?.closest(ROOTS);
  if (root?.id === "site-header") return "header";
  if (root?.id === "site-footer") return "footer";
  return page;
}
const scopeOf = (node) =>
  ["header", "footer"].includes(rootKey(node)) ? "shared" : page;

// Path segments from an element up to (not including) its root. Wrapper spans are ignored when counting siblings.
function segmentsFor(owner, root) {
  const segments = [];
  let current = owner;
  while (current && current !== root) {
    const identity =
      current.id ||
      [...current.classList]
        .filter(
          (name) => name !== "rv" && name !== "on" && !name.startsWith("ed-"),
        )
        .slice(0, 2)
        .join("-");
    const siblings = [...current.parentElement.children].filter(
        (el) =>
          el.tagName === current.tagName &&
          !el.hasAttribute("data-content-key") &&
          !el.classList.contains("cs"),
      ),
      position = siblings.indexOf(current) + 1;
    segments.unshift(
      `${slug(identity || current.tagName.toLowerCase())}_${position}`,
    );
    current = current.parentElement;
  }
  return segments;
}
function nodeKey(node) {
  const owner = node.parentElement,
    root = owner?.closest(ROOTS);
  if (!owner || !root) return null;
  const segments = segmentsFor(owner, root);
  const textNodes = [...owner.childNodes].filter(
    (child) => child.nodeType === Node.TEXT_NODE && child.nodeValue.trim(),
  );
  return `${rootKey(node)}_${segments.join("_")}_t${textNodes.indexOf(node)}`;
}
function elemKey(el) {
  const root = el.closest(ROOTS);
  if (
    !root ||
    el === root ||
    el.hasAttribute("data-content-key") ||
    el.closest(".cs")
  )
    return null;
  return `${rootKey(el)}_e_${segmentsFor(el, root).join("_")}`;
}
function ignored(node) {
  return !!node.parentElement.closest(
    "script,style,svg,textarea,input,select,option,code,pre,.p,.post,[data-content-ignore]",
  );
}

function wrapText() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT),
    nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (
      node.nodeValue.trim() &&
      !ignored(node) &&
      node.parentElement &&
      !node.parentElement.closest("[data-content-key]")
    )
      nodes.push(node);
  }
  const keyed = nodes.map((node) => [node, nodeKey(node)]);
  for (const [node, key] of keyed) {
    if (!key) continue;
    const span = document.createElement("span");
    span.dataset.contentKey = key;
    node.parentNode.replaceChild(span, node);
    span.append(node);
  }
}
function annotateAttributes() {
  document
    .querySelectorAll(
      "input[placeholder],textarea[placeholder],img[alt],[aria-label]",
    )
    .forEach((element, index) => {
      if (element.closest("[data-content-ignore]")) return;
      for (const attribute of ["placeholder", "alt", "aria-label"]) {
        if (!element.hasAttribute(attribute)) continue;
        const key = `${rootKey(element)}_attribute_${slug(element.id || element.getAttribute("name") || element.tagName.toLowerCase())}_${attribute}_${index}`;
        element.setAttribute(`data-content-key-${attribute}`, key);
      }
    });
}

const safeUrl = (value) =>
  /^(https?:\/\/|\/|mailto:|tel:|#)[^\s"'()<>\\]*$/i.test(value);
const safeImage = (value) => /^(https?:\/\/|\/)[^\s"'()<>\\]*$/i.test(value);
function elementMap() {
  const map = new Map();
  document
    .querySelectorAll("#site-header *,#site-footer *,main *")
    .forEach((el) => {
      if (
        el.hasAttribute("data-content-key") ||
        /^(SCRIPT|STYLE)$/.test(el.tagName)
      )
        return;
      const key = elemKey(el);
      if (key) map.set(key, el);
    });
  return map;
}
function applyElement(el, kind, value) {
  if (typeof value !== "string") return;
  if (kind === "src" && el.tagName === "IMG" && safeImage(value)) {
    el.removeAttribute("srcset");
    el.src = value;
  } else if (kind === "bg" && safeImage(value))
    el.style.backgroundImage = `url("${value}")`;
  else if (kind === "href" && safeUrl(value)) el.setAttribute("href", value);
  else if (kind === "bgc") {
    if (HEX.test(value)) el.style.backgroundColor = value;
    else el.style.removeProperty("background-color");
  } else if (kind === "txc") {
    if (HEX.test(value)) el.style.color = value;
    else el.style.removeProperty("color");
  } else if (kind === "hide") {
    if (value === "1") {
      editing ? el.classList.add("ed-hidden") : (el.style.display = "none");
    } else {
      el.classList.remove("ed-hidden");
      if (!editing) el.style.removeProperty("display");
    }
  }
}
function applyValues(shared, local) {
  const value = (key) => shared[key] ?? local[key];
  document.querySelectorAll("[data-content-key]").forEach((el) => {
    const v = value(el.dataset.contentKey);
    if (typeof v === "string") el.textContent = v;
  });
  document
    .querySelectorAll(
      "[data-content-key-placeholder],[data-content-key-alt],[data-content-key-aria-label]",
    )
    .forEach((el) =>
      ["placeholder", "alt", "aria-label"].forEach((attribute) => {
        const key = el.getAttribute(`data-content-key-${attribute}`);
        if (key) {
          const v = value(key);
          if (typeof v === "string") el.setAttribute(attribute, v);
        }
      }),
    );
  const keys = new Set([...Object.keys(shared), ...Object.keys(local)]);
  if ([...keys].some((key) => /^(src|href|bg|bgc|txc|hide)_/.test(key))) {
    const map = elementMap();
    for (const key of keys) {
      const m = key.match(/^(src|href|bg|bgc|txc|hide)_(.+)$/);
      if (!m) continue;
      const el = map.get(m[2]);
      if (el) applyElement(el, m[1], value(key));
    }
  }
}

wrapText();
annotateAttributes();

// ===== Sections added by the admin (stored in pageSections/<page>) =====
function buildSection(id, data) {
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const type = ["text", "imgtext", "banner", "cards"].includes(data.type)
    ? data.type
    : "text";
  const section = make("section", `cs cs-${type}${data.flip ? " flip" : ""}`);
  section.dataset.csId = id;
  section.setAttribute("data-content-ignore", "");
  if (HEX.test(data.bg || "")) section.style.backgroundColor = data.bg;
  if (HEX.test(data.color || "")) section.style.color = data.color;
  const wrap = make("div", "w");
  section.append(wrap);
  const textBlock = type === "imgtext" ? make("div") : wrap;
  if (type === "imgtext") {
    const media = make("div", "cs-media");
    if (safeImage(data.img || "")) {
      const img = make("img");
      img.src = data.img;
      img.alt = data.title || "";
      img.loading = "lazy";
      media.append(img);
    }
    wrap.append(media, textBlock);
    textBlock.style.display = "grid";
    textBlock.style.gap = "16px";
  }
  if (data.title) textBlock.append(make("h2", "", data.title));
  if (data.text) textBlock.append(make("p", "", data.text));
  if (type === "cards") {
    const grid = make("div", "cs-grid");
    String(data.cards || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 12)
      .forEach((line) => {
        const [title, ...rest] = line.split("|");
        const card = make("div", "cs-card");
        card.append(make("h3", "", title.trim()));
        if (rest.join("|").trim()) card.append(make("p", "", rest.join("|").trim()));
        grid.append(card);
      });
    textBlock.append(grid);
  }
  if (data.btn && safeUrl(data.link || "")) {
    const link = make("a", "cs-btn", data.btn);
    link.href = data.link;
    textBlock.append(link);
  }
  return section;
}
function placeSections(all) {
  document.querySelectorAll(".cs").forEach((node) => node.remove());
  const main = document.querySelector("main");
  if (!main) return;
  const anchors = elementMap(),
    lastAfter = new Map();
  Object.entries(all || {})
    .filter(([, data]) => data && typeof data === "object")
    .sort((a, b) => (a[1].created || 0) - (b[1].created || 0))
    .forEach(([id, data]) => {
      const section = buildSection(id, data),
        after = data.after || "end";
      let base = lastAfter.get(after) || null;
      if (!base && after.startsWith("cs:"))
        base = main.querySelector(`[data-cs-id="${CSS.escape(after.slice(3))}"]`);
      else if (!base && after !== "end" && after !== "top")
        base = anchors.get(after) || null;
      if (after === "top" && !base) main.prepend(section);
      else if (base && base.parentElement === main) base.after(section);
      else main.append(section);
      lastAfter.set(after, section);
    });
}
async function loadSections() {
  try {
    sectionsData = (await get(ref(database, `pageSections/${page}`))).val() || {};
    placeSections(sectionsData);
  } catch (error) {
    console.warn("Could not load page sections:", error);
  }
}

async function loadAndApply() {
  try {
    const [shared, local] = await Promise.all([
      get(ref(database, "siteContent/shared")),
      get(ref(database, `siteContent/${page}`)),
    ]);
    applyValues(shared.val() || {}, local.val() || {});
    await loadSections();
  } catch (error) {
    console.error("Could not load editable store content:", error);
  }
}

const EDIT_PAGES = [
  ["index.html", "Home"],
  ["products.html", "Shop"],
  ["product.html", "Product page"],
  ["deals.html", "Offers"],
  ["how-it-works.html", "How it works"],
  ["app-page.html", "App page"],
  ["about.html", "About"],
  ["blog.html", "Journal"],
  ["news.html", "News"],
  ["contact.html", "Contact"],
  ["account.html", "Customer account"],
];
function floatingBar(html) {
  const bar = document.createElement("div");
  bar.id = "ed-topbar";
  bar.style.cssText =
    "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:100000;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;max-width:94vw;padding:8px 10px;background:#17283f;color:#fff;border-radius:999px;box-shadow:0 8px 28px #0006;font:600 13px system-ui,sans-serif";
  bar.innerHTML = html;
  bar.querySelectorAll("a,button,select").forEach((el) => {
    el.style.cssText =
      "border:0;border-radius:999px;padding:8px 14px;background:#2b3f5c;color:#fff;font:inherit;text-decoration:none;cursor:pointer" +
      (el.dataset.primary ? ";background:#f5cf73;color:#17283f" : "");
  });
  document.body.append(bar);
  return bar;
}
async function firstProductId() {
  try {
    const value = (await get(ref(database, "products"))).val() || {};
    return Object.values(value)[0]?.id ?? 1;
  } catch {
    return 1;
  }
}

if (!editing) {
  loadAndApply();
} else {
  const inFrame = window.top !== window;
  const label = document.createElement("div");
  label.style.display = "none";
  label.className = "edit-mode-label";
  label.textContent = "Checking admin access…";
  document.body.prepend(label);
  // Anyone who is not a signed-in administrator simply gets the normal website.
  const leave = (text) => {
    if (inFrame) {
      label.style.display = "";
      label.textContent = text;
      try {
        parent.postMessage(
          { type: "aurum-editor-status", text },
          location.origin,
        );
      } catch {}
      return;
    }
    const clean = new URL(location.href);
    clean.searchParams.delete("edit");
    location.replace(clean.pathname + clean.search + clean.hash);
  };

  const say = (text) => {
    label.textContent = text;
    try {
      parent.postMessage(
        { type: "aurum-editor-status", text },
        location.origin,
      );
    } catch {}
  };
  const timers = new Map();
  function save(scope, key, value) {
    if (!/^[a-z0-9_-]{1,700}$/.test(key))
      return say("That element cannot be saved.");
    say("Saving…");
    clearTimeout(timers.get(scope + key));
    timers.set(
      scope + key,
      setTimeout(
        () =>
          update(ref(database, `siteContent/${scope}`), { [key]: value })
            .then(() => say("All changes saved"))
            .catch((error) => say(`Could not save: ${error.message}`)),
        400,
      ),
    );
  }

  let tools,
    selected = null,
    hovered = null;
  const mark = (el, cls, on) => el && el.classList.toggle(cls, on);

  function bgOf(el) {
    return el && /url\(/.test(getComputedStyle(el).backgroundImage) ? el : null;
  }
  function attrOf(el) {
    return ["placeholder", "alt", "aria-label"].find((name) =>
      el.hasAttribute(`data-content-key-${name}`),
    );
  }

  async function uploadImage(file) {
    if (!file) throw new Error("Choose an image.");
    if (file.size > 8 * 1024 * 1024)
      throw new Error("Image must be smaller than 8 MB.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw new Error("Use a JPG, PNG or WebP image.");
    const signing = await authenticatedRequest("/api/cloudinary-sign", {
      method: "POST",
      body: "{}",
    });
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", signing.apiKey);
    form.append("timestamp", String(signing.timestamp));
    form.append("signature", signing.signature);
    form.append("folder", signing.folder);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(signing.cloudName)}/image/upload`,
      { method: "POST", body: form },
    );
    const result = await response.json();
    if (!response.ok || !result.secure_url)
      throw new Error(result.error?.message || "Image upload failed.");
    return result.secure_url;
  }
  function setImage(el, kind, url) {
    if (!safeImage(url)) return say("Use a full https:// image address.");
    applyElement(el, kind, url);
    const key = elemKey(el);
    if (key) save(scopeOf(el), `${kind}_${key}`, url);
  }
  function chooseImage(el, kind) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = async () => {
      try {
        say("Uploading image…");
        setImage(el, kind, await uploadImage(input.files[0]));
      } catch (error) {
        say(error.message);
      }
    };
    input.click();
  }
  function editLink(a) {
    const value = prompt(
      "Link address (e.g. /products.html, https://…, tel:+254…, mailto:…):",
      a.getAttribute("href") || "",
    );
    if (value === null) return;
    const clean = value.trim();
    if (!safeUrl(clean))
      return say(
        "That link is not allowed. Use /page.html, https://, tel: or mailto:.",
      );
    a.setAttribute("href", clean);
    const key = elemKey(a);
    if (key) save(scopeOf(a), `href_${key}`, clean);
  }
  function editAttributes(el) {
    for (const name of ["placeholder", "alt", "aria-label"]) {
      const key = el.getAttribute(`data-content-key-${name}`);
      if (!key) continue;
      const value = prompt(
        `Edit ${name.replace("-", " ")}:`,
        el.getAttribute(name) || "",
      );
      if (value === null) continue;
      el.setAttribute(name, value);
      save(scopeOf(el), key, value);
    }
  }
  function toggleHide(el) {
    const key = elemKey(el);
    if (!key) return say("This element cannot be hidden.");
    const hide = !el.classList.contains("ed-hidden");
    el.classList.toggle("ed-hidden", hide);
    save(scopeOf(el), `hide_${key}`, hide ? "1" : "0");
    showTools(el);
  }
  function resetElement(el) {
    const key = elemKey(el);
    if (!key) return;
    if (
      !confirm(
        "Undo image, link and visibility changes on this element and reload?",
      )
    )
      return;
    update(ref(database, `siteContent/${scopeOf(el)}`), {
      [`src_${key}`]: null,
      [`href_${key}`]: null,
      [`bg_${key}`]: null,
      [`hide_${key}`]: null,
      [`bgc_${key}`]: null,
      [`txc_${key}`]: null,
    })
      .then(() => location.reload())
      .catch((error) => say(`Could not reset: ${error.message}`));
  }
  function openDashboard(tab) {
    if (window.top === window) return openDrawer(tab);
    try {
      parent.postMessage(
        { type: "aurum-open-dashboard", tab },
        location.origin,
      );
    } catch {}
  }

  // ---------- Dashboard drawer (the full dashboard, inside the live site) ----------
  let drawer = null,
    drawerTab = "",
    dirty = false;
  function ensureStyles() {
    if (document.getElementById("ed-extra-css")) return;
    const style = document.createElement("style");
    style.id = "ed-extra-css";
    style.textContent = `
#ed-drawer{position:fixed;top:0;right:0;bottom:0;z-index:100001;width:min(600px,100vw);display:none;flex-direction:column;background:#f5f6f8;box-shadow:-10px 0 40px #0006;font-family:system-ui,sans-serif}
#ed-drawer header{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#17283f;color:#fff}
#ed-drawer header b{flex:1;font-size:14px}
#ed-drawer header a,#ed-drawer header button{border:0;border-radius:999px;padding:7px 13px;background:#2b3f5c;color:#fff;font:600 12px system-ui;text-decoration:none;cursor:pointer}
#ed-drawer iframe{flex:1;width:100%;border:0;background:#f5f6f8}
#ed-modal{position:fixed;inset:0;z-index:100002;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px;background:#0009;font-family:system-ui,sans-serif}
#ed-modal form{width:min(560px,100%);display:grid;gap:12px;padding:22px;border-radius:12px;background:#fff;color:#17283f;box-shadow:0 20px 60px #0007}
#ed-modal h3{margin:0;font-size:20px}
#ed-modal label{display:grid;gap:5px;font:600 13px system-ui}
#ed-modal input:not([type=checkbox]):not([type=color]),#ed-modal textarea,#ed-modal select{width:100%;padding:10px;border:1px solid #c9ced6;border-radius:6px;font:14px system-ui;box-sizing:border-box}
#ed-modal input[type=color]{width:60px;height:38px;padding:2px;border:1px solid #c9ced6;border-radius:6px;cursor:pointer}
#ed-modal .row{display:flex;gap:14px;flex-wrap:wrap;align-items:center}
#ed-modal .row label{display:flex;align-items:center;gap:8px}
#ed-modal .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:4px}
#ed-modal button{border:0;border-radius:6px;padding:11px 18px;font:700 14px system-ui;cursor:pointer;background:#e4e7ec;color:#17283f}
#ed-modal button.primary{background:#f5cf73}
#ed-modal small{color:#667}
.cs-ctrl-note{outline:2px dashed #2b7fff;outline-offset:-3px}
`;
    document.head.append(style);
  }
  function openDrawer(tab = "Products") {
    ensureStyles();
    if (!drawer) {
      drawer = document.createElement("aside");
      drawer.id = "ed-drawer";
      drawer.innerHTML =
        '<header><b>Admin dashboard</b><a id="ed-full" target="_blank" rel="noopener">Full screen ↗</a><button type="button" id="ed-close">Close ✕</button></header><iframe title="Admin dashboard"></iframe>';
      document.body.append(drawer);
      drawer.querySelector("#ed-close").addEventListener("click", closeDrawer);
    }
    const url = `/admin.html?dashboard=1&embed=1&tab=${encodeURIComponent(tab)}`;
    if (drawerTab !== tab) {
      drawer.querySelector("iframe").src = url;
      drawerTab = tab;
    }
    drawer.querySelector("#ed-full").href = `/admin.html?dashboard=1&tab=${encodeURIComponent(tab)}`;
    drawer.style.display = "flex";
  }
  function closeDrawer() {
    if (drawer) drawer.style.display = "none";
    if (dirty) location.reload();
  }
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === "aurum-admin-saved") dirty = true;
  });

  // ---------- Colours for any selected element ----------
  function toHex(color) {
    const m = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return "#ffffff";
    return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  }
  function pickColor(el, kind) {
    const key = elemKey(el);
    if (!key) return say("This element cannot be coloured.");
    const input = document.createElement("input");
    input.type = "color";
    input.style.cssText = "position:fixed;left:-100px;top:0;opacity:0";
    input.value = toHex(getComputedStyle(el)[kind === "bgc" ? "backgroundColor" : "color"]);
    document.body.append(input);
    input.addEventListener("input", () => {
      applyElement(el, kind, input.value);
      save(scopeOf(el), `${kind}_${key}`, input.value);
    });
    input.addEventListener("change", () => setTimeout(() => input.remove(), 400));
    input.click();
  }

  // ---------- Add / edit / delete sections ----------
  function blockLabel(node) {
    const heading = node.querySelector("h1,h2,h3");
    const text = (heading?.textContent || node.className || node.tagName).trim().replace(/\s+/g, " ");
    return text.slice(0, 48);
  }
  function positionOptions(current) {
    const main = document.querySelector("main");
    const options = [["top", "At the top of the page"]];
    [...main.children].forEach((node) => {
      const value = node.classList.contains("cs") ? `cs:${node.dataset.csId}` : elemKey(node);
      if (value) options.push([value, `After: ${blockLabel(node)}`]);
    });
    options.push(["end", "At the end of the page"]);
    return options
      .map(([value, label]) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`)
      .join("");
  }
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function openSectionForm(id) {
    ensureStyles();
    const existing = id ? sectionsData[id] : null;
    let defaultAfter = existing?.after || "end";
    if (!existing && selected) {
      const block = selected.closest("main > *");
      const value = block?.classList.contains("cs") ? `cs:${block.dataset.csId}` : block && elemKey(block);
      if (value) defaultAfter = value;
    }
    const d = existing || { type: "text" };
    const modal = document.createElement("div");
    modal.id = "ed-modal";
    modal.innerHTML = `<form>
<h3>${existing ? "Edit section" : "Add a section"}</h3>
<label>Layout<select name="type">
<option value="text">Heading + text</option>
<option value="imgtext">Image beside text</option>
<option value="banner">Banner / call to action</option>
<option value="cards">Cards (feature boxes)</option></select></label>
<label>Heading<input name="title" maxlength="120" value="${esc(d.title)}"></label>
<label>Text<textarea name="text" rows="4" maxlength="2000">${esc(d.text)}</textarea></label>
<label data-for="cards">Cards, one per line as: Title | short text<textarea name="cards" rows="4" maxlength="2000" placeholder="Fast delivery | Nairobi in 24 hours&#10;Warranty | 12 months on every product">${esc(d.cards)}</textarea></label>
<div data-for="imgtext"><label>Image address<input name="img" placeholder="https://…" value="${esc(d.img)}"></label><div class="row" style="margin-top:8px"><button type="button" data-upload>Upload an image</button><label><input type="checkbox" name="flip"${d.flip ? " checked" : ""}> Put the image on the right</label></div></div>
<div class="row"><label>Button text<input name="btn" maxlength="40" value="${esc(d.btn)}" placeholder="Shop now"></label><label>Button link<input name="link" value="${esc(d.link)}" placeholder="/products.html"></label></div>
<div class="row"><label><input type="checkbox" name="useBg"${HEX.test(d.bg || "") ? " checked" : ""}> Background <input type="color" name="bg" value="${HEX.test(d.bg || "") ? d.bg : "#f4f5f7"}"></label><label><input type="checkbox" name="useColor"${HEX.test(d.color || "") ? " checked" : ""}> Text colour <input type="color" name="color" value="${HEX.test(d.color || "") ? d.color : "#17283f"}"></label></div>
<label>Position<select name="after">${positionOptions(defaultAfter)}</select></label>
<small class="msg"></small>
<div class="actions"><button type="button" data-cancel>Cancel</button><button class="primary" type="submit">${existing ? "Save section" : "Add section"}</button></div></form>`;
    document.body.append(modal);
    const form = modal.querySelector("form"),
      f = form.elements,
      msg = form.querySelector(".msg");
    f.type.value = d.type || "text";
    const sync = () => {
      form.querySelectorAll("[data-for]").forEach((node) => {
        node.style.display = node.dataset.for === f.type.value ? "" : "none";
      });
    };
    f.type.addEventListener("change", sync);
    sync();
    form.querySelector("[data-cancel]").addEventListener("click", () => modal.remove());
    form.querySelector("[data-upload]").addEventListener("click", () => {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "image/jpeg,image/png,image/webp";
      picker.onchange = async () => {
        try {
          msg.textContent = "Uploading image…";
          f.img.value = await uploadImage(picker.files[0]);
          msg.textContent = "Image uploaded.";
        } catch (error) {
          msg.textContent = error.message;
        }
      };
      picker.click();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const link = f.link.value.trim(),
        img = f.img.value.trim();
      if (link && !safeUrl(link)) return (msg.textContent = "Button link must start with /, https://, tel: or mailto:");
      if (img && !safeImage(img)) return (msg.textContent = "Image address must start with https://");
      if (!f.title.value.trim() && !f.text.value.trim() && !img && !f.cards.value.trim())
        return (msg.textContent = "Add a heading, text or an image.");
      const key = id || `s${Date.now().toString(36)}`;
      const data = {
        type: f.type.value,
        title: f.title.value.trim(),
        text: f.text.value.trim(),
        cards: f.type.value === "cards" ? f.cards.value.trim() : null,
        img: f.type.value === "imgtext" && img ? img : null,
        flip: f.type.value === "imgtext" && f.flip.checked ? true : null,
        btn: f.btn.value.trim() && link ? f.btn.value.trim() : null,
        link: f.btn.value.trim() && link ? link : null,
        bg: f.useBg.checked ? f.bg.value : null,
        color: f.useColor.checked ? f.color.value : null,
        after: f.after.value,
        created: existing?.created || Date.now(),
      };
      try {
        msg.textContent = "Saving…";
        await update(ref(database, `pageSections/${page}/${key}`), data);
        sectionsData[key] = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null));
        placeSections(sectionsData);
        modal.remove();
        say(existing ? "Section saved." : "Section added. Click it to edit or delete.");
      } catch (error) {
        msg.textContent = `Could not save: ${error.message}`;
      }
    });
  }
  async function deleteSection(id) {
    if (!confirm("Delete this section from the page?")) return;
    try {
      await update(ref(database, `pageSections/${page}`), { [id]: null });
      delete sectionsData[id];
      placeSections(sectionsData);
      tools.style.display = "none";
      say("Section deleted.");
    } catch (error) {
      say(`Could not delete: ${error.message}`);
    }
  }

  function showTools(el) {
    selected = el;
    document
      .querySelectorAll(".ed-selected")
      .forEach((node) => node.classList.remove("ed-selected"));
    mark(el, "ed-selected", true);
    tools.innerHTML = "";
    const add = (text, fn, title) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      if (title) button.title = title;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fn();
      });
      tools.append(button);
    };
    const product = el.closest(".p"),
      post = el.closest(".post");
    const cs = el.closest(".cs");
    if (cs) {
      add("Edit section", () => openSectionForm(cs.dataset.csId));
      add("Delete section", () => deleteSection(cs.dataset.csId));
    } else if (product || post) {
      add(product ? "Edit products →" : "Edit journal →", () =>
        openDashboard(product ? "Products" : "Journal"),
      );
    } else {
      const parentEl = el.parentElement;
      if (parentEl && parentEl.closest(ROOTS) && !parentEl.matches(ROOTS))
        add(
          "↑ Parent",
          () => showTools(parentEl),
          "Select the element around this one",
        );
      const a = el.closest("a");
      if (a) add("Edit link", () => editLink(a));
      if (el.tagName === "IMG") {
        add("Change image", () => chooseImage(el, "src"));
        add("Image URL", () => {
          const v = prompt(
            "Image address (https://…):",
            el.currentSrc || el.src,
          );
          if (v) setImage(el, "src", v.trim());
        });
      } else if (bgOf(el)) {
        add("Change background", () => chooseImage(el, "bg"));
        add("Background URL", () => {
          const v = prompt("Image address (https://…):", "");
          if (v) setImage(el, "bg", v.trim());
        });
      }
      if (attrOf(el)) add("Edit description", () => editAttributes(el));
      if (elemKey(el)) {
        add(el.classList.contains("ed-hidden") ? "Show" : "Hide", () =>
          toggleHide(el),
        );
        add("Background colour", () => pickColor(el, "bgc"));
        add("Text colour", () => pickColor(el, "txc"));
        add("Reset", () => resetElement(el));
      }
    }
    const rect = el.getBoundingClientRect();
    tools.style.display = "flex";
    const top = Math.max(
      rect.top + scrollY - tools.offsetHeight - 8,
      scrollY + 4,
    );
    tools.style.top = `${top}px`;
    tools.style.left = `${Math.max(4, Math.min(rect.left + scrollX, document.documentElement.clientWidth - tools.offsetWidth - 4))}px`;
  }

  let enabled = false;
  async function enableEditing(user) {
    if (enabled) return;
    if (!user) {
      leave("Sign in on the admin page to edit this website.");
      return;
    }
    try {
      const check = await adminStatus();
      if (!check.admin) {
        leave(check.reason || "This account is not an administrator.");
        return;
      }
    } catch (error) {
      leave("Could not confirm administrator access.");
      return;
    }

    enabled = true;
    document.documentElement.classList.add("content-editing");
    label.style.display = "";
    tools = document.createElement("div");
    tools.className = "ed-tools";
    tools.style.display = "none";
    document.body.append(tools);
    await loadAndApply();

    document.querySelectorAll("[data-content-key]").forEach((el) => {
      el.contentEditable = "true";
      el.spellcheck = true;
      el.addEventListener("input", () =>
        save(scopeOf(el), el.dataset.contentKey, el.textContent),
      );
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          el.blur();
        }
      });
      el.addEventListener("paste", (event) => {
        event.preventDefault();
        document.execCommand(
          "insertText",
          false,
          (event.clipboardData || window.clipboardData)
            .getData("text/plain")
            .replace(/\s+/g, " "),
        );
      });
    });
    document
      .querySelectorAll("input[data-content-key-placeholder]")
      .forEach((el) => el.classList.add("content-attribute-editable"));

    document.addEventListener(
      "click",
      (event) => {
        if (
          tools.contains(event.target) ||
          event.target.closest("#ed-topbar,#ed-modal,#ed-drawer")
        )
          return;
        const target = event.target;
        event.preventDefault();
        event.stopPropagation();
        const text = target.closest("[data-content-key]");
        const el = text ? text.parentElement : target;
        if (
          !el ||
          el === document.body ||
          el === document.documentElement ||
          !el.closest(`${ROOTS},.ed-tools`)
        ) {
          tools.style.display = "none";
          return;
        }
        showTools(el);
      },
      true,
    );
    document.addEventListener(
      "submit",
      (event) => {
        if (!event.target.closest("#ed-modal")) event.preventDefault();
      },
      true,
    );
    document.addEventListener("mouseover", (event) => {
      if (
        tools.contains(event.target) ||
        event.target.closest("#ed-topbar,#ed-modal,#ed-drawer")
      )
        return;
      mark(hovered, "ed-hover", false);
      hovered = event.target.closest("[data-content-key]")
        ? null
        : event.target;
      mark(hovered, "ed-hover", true);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        tools.style.display = "none";
        selected?.classList.remove("ed-selected");
      }
    });
    say(
      "Click any text to type. Click an image, button, section or link to change, hide or re-link it. Changes save automatically.",
    );

    // Editing the real site directly (not inside the editor preview): page switcher + exit/sign out.
    if (window.top === window && !document.getElementById("ed-topbar")) {
      const current = location.pathname.split("/").pop() || "index.html",
        file = current.endsWith(".html")
          ? current
          : `${current || "index"}.html`;
      const bar = floatingBar(
        `<label style="display:flex;align-items:center;gap:6px">Page <select id="ed-page">${EDIT_PAGES.map(([f, l]) => `<option value="${f}"${f === file || (f === "index.html" && (current === "" || current === "index")) ? " selected" : ""}>${l}</option>`).join("")}</select></label><button type="button" id="ed-add">＋ Add section</button><button type="button" id="ed-dash">🗂 Dashboard</button><a data-primary="1" id="ed-live" href="${location.pathname}">Done · view live</a><button type="button" id="ed-out">Sign out</button>`,
      );
      bar.querySelector("#ed-add").addEventListener("click", () => openSectionForm());
      bar.querySelector("#ed-dash").addEventListener("click", () => openDrawer("Products"));
      bar
        .querySelector("#ed-page")
        .addEventListener("change", async (event) => {
          const target = event.target.value;
          let query = "edit=1";
          if (target === "product.html")
            query = `id=${encodeURIComponent(await firstProductId())}&edit=1`;
          location.href = `/${target}?${query}`;
        });
      bar
        .querySelector("#ed-out")
        .addEventListener("click", () =>
          signOut(auth).finally(() => location.replace("/admin.html")),
        );
      const live = new URL(location.href);
      live.searchParams.delete("edit");
      bar.querySelector("#ed-live").href = live.pathname + live.search;
    }
  }
  onAuthStateChanged(auth, enableEditing);
}
