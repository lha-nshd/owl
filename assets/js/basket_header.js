// ============================================================
// GLOBAL basket logic — loads on ALL pages
// ============================================================
const BASKET_KEY = "nshd_variable_basket";

function loadBasket() {
  try {
    return JSON.parse(localStorage.getItem(BASKET_KEY)) || [];
  } catch {
    return [];
  }
}

function saveBasket(basket) {
  localStorage.setItem(BASKET_KEY, JSON.stringify(basket));
  window.dispatchEvent(new CustomEvent("nshd-basket-changed"));
}

function updateBasketCountUI() {
  const basket = loadBasket();
  const elMain = document.getElementById("basketCount");
  const basketTop = document.getElementById("basketTop");
  if (elMain) elMain.textContent = basket.length;

  // ⭐ Glow when basket is non-empty
  if (basketTop) {
    if (basket.length > 0) {
      basketTop.classList.add("basket-glow");
    } else {
      basketTop.classList.remove("basket-glow");
    }
  }
}

function isInBasket(varName) {
  return loadBasket().some(item => item.varName === varName);
}

// ── Longitudinal sibling lookup ─────────────────────────────────────────────
// Lazily fetches the full dictionary once (any page, first time it's needed),
// groups by Showcase Field ID exactly like the longitudinal page does, and
// keeps only groups with 2+ sweeps. This is the single source of truth for
// "which variables are sweeps of the same longitudinal Field ID" — the
// longitudinal page does NOT duplicate this logic; it just calls addToBasket
// per variable, and expansion happens here.
const DATA_DICTIONARY_URL = "/OWL/assets/data/search_methods/data_dictionary/NSHD_Data_Dictionary_Public.json";
let longitudinalSiblingsPromise = null;

function loadLongitudinalSiblings() {
  if (!longitudinalSiblingsPromise) {
    // Cache-bust: fetch() responses are subject to normal HTTP caching,
    // completely separate from the ?v= on the <script> tag that loads this
    // file. A stale cached copy of the dictionary here wouldn't error —
    // it would just silently produce an incomplete sibling map, which
    // looks exactly like undercounted toast totals. One fresh fetch per
    // page load (this promise is cached for the rest of the page's life)
    // is a small, one-time cost worth paying for correctness.
    longitudinalSiblingsPromise = fetch(DATA_DICTIONARY_URL + "?_=" + Date.now())
      .then(r => r.json())
      .then(data => {
        const groups = {};
        data.forEach(row => {
          const fid = row["Showcase Field ID"];
          const varName = row["NSHD Variable Name"];
          if (!fid || !varName) return;
          if (!groups[fid]) groups[fid] = [];
          groups[fid].push({ varName, label: row["Variable Label"] || "" });
        });
        const map = new Map();
        Object.values(groups).forEach(members => {
          if (members.length < 2) return; // not truly longitudinal
          members.forEach(m => map.set(m.varName, members.filter(x => x.varName !== m.varName)));
        });
        return map;
      })
      .catch(() => new Map());
  }
  return longitudinalSiblingsPromise;
}

// Given a list of variable names being added, returns (via Promise) the
// sibling variables — from the same longitudinal Field ID(s) — that aren't
// already among those names. Exposed globally so baskets.js can use it to
// preview counts before the user confirms an upload.
function expandBasketItemsWithSiblings(items) {
  const varNames = (items || []).map(i => i.varName || i).filter(Boolean);
  return loadLongitudinalSiblings().then(map => {
    const seen = new Set(varNames);
    const result = [];
    varNames.forEach(vn => {
      const siblings = map.get(vn);
      if (!siblings) return;
      siblings.forEach(s => {
        if (!seen.has(s.varName)) {
          seen.add(s.varName);
          result.push(s);
        }
      });
    });
    return result;
  });
}

const AUTO_ADD_SIBLINGS_KEY = "nshd_auto_add_linked_sweeps";

function getAutoAddSiblings() {
  const v = localStorage.getItem(AUTO_ADD_SIBLINGS_KEY);
  return v === null ? true : v === "true"; // default ON
}

function setAutoAddSiblings(val) {
  localStorage.setItem(AUTO_ADD_SIBLINGS_KEY, val ? "true" : "false");
}

// Formats a list of variable names for the toast message, e.g.
// "wt50u", "wt50u and wt52u", "wt50u, wt52u and wt53u", or, once the list
// gets long, "wt50u, wt52u, wt53u and 4 more".
function formatVarNameList(items, max) {
  max = max || 4;
  const names = items.map(i => i.varName);
  if (names.length === 1) return names[0];
  if (names.length <= max) {
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }
  return names.slice(0, max).join(", ") + ` and ${names.length - max} more`;
}

// ── Toast shown after siblings get auto-added or auto-removed ──────────────
// items = [{ varName, label }, ...] — needed (not just names) so an "Undo"
// after a removal can re-add them with their correct labels intact.
function showLinkedSweepsToast(items, action) {
  if (!items || items.length === 0) return;
  let toast = document.getElementById("linkedSweepsToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "linkedSweepsToast";
    Object.assign(toast.style, {
      position: "fixed", zIndex: "999999", maxWidth: "360px",
      background: "#E1F5EE", color: "#085041", padding: "10px 14px",
      borderRadius: "6px", fontSize: "12px",
      border: "1px solid #9AD4BE", boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
      display: "flex", alignItems: "center", gap: "10px"
    });
    document.body.appendChild(toast);
  }
  toast.innerHTML = "";
  const msg = document.createElement("span");
  msg.style.wordBreak = "break-word";
  const total = items.length;
  const list = formatVarNameList(items);
  // State the total up front so it's never something the user has to work
  // out themselves from a truncated list — the number here is always
  // items.length directly, not reconstructed from "N shown + M more".
  msg.textContent = action === "removed"
    ? `Also removed ${total} related sweep${total === 1 ? "" : "s"} from your basket: ${list}`
    : `Also added ${total} related sweep${total === 1 ? "" : "s"} to your basket: ${list}`;
  const undo = document.createElement("a");
  undo.href = "#";
  undo.textContent = "Undo";
  Object.assign(undo.style, { color: "#085041", textDecoration: "underline" });
  undo.addEventListener("click", e => {
    e.preventDefault();
    if (action === "removed") {
      batchAddToBasket(items, { expandSiblings: false });
    } else {
      batchRemoveFromBasket(items.map(i => i.varName), { expandSiblings: false });
    }
    toast.style.display = "none";
  });
  toast.appendChild(msg);
  toast.appendChild(undo);

  // Anchor under the basket icon rather than a fixed screen corner, so it
  // reads as feedback from the basket specifically, not a generic page toast.
  const anchor = document.getElementById("basketWrapper") || document.getElementById("basketTop");
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    toast.style.top = (rect.bottom + 8) + "px";
    toast.style.left = rect.left + "px";
    toast.style.right = "auto";
    toast.style.bottom = "auto";
  } else {
    toast.style.top = "auto";
    toast.style.left = "auto";
    toast.style.right = "20px";
    toast.style.bottom = "20px";
  }

  toast.style.display = "flex";
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => { toast.style.display = "none"; }, 10000);
}

// ── Shared upsert core — used by both addToBasket and batchAddToBasket ─────
// Adds new items, refreshes the label on ones already present. Returns the
// varNames that were genuinely new (for accurate toast counts / new-item UI).
function _upsertBasketItems(items) {
  if (!items || items.length === 0) return [];
  const basket = loadBasket();
  const indexByName = new Map();
  basket.forEach((item, i) => indexByName.set(item.varName, i));
  const addedNames = [];
  items.forEach(({ varName, label }) => {
    if (!varName) return;
    if (indexByName.has(varName)) {
      const i = indexByName.get(varName);
      if (label && basket[i].label !== label) basket[i].label = label;
    } else {
      basket.push({ varName, label });
      indexByName.set(varName, basket.length - 1);
      addedNames.push(varName);
    }
  });
  saveBasket(basket);
  return addedNames;
}

function _pulseBasketUI() {
  updateBasketCountUI();
  const badge = document.getElementById("basketCount");
  if (badge) {
    badge.classList.add("added");
    setTimeout(() => badge.classList.remove("added"), 400);
  }
  const basketTop = document.getElementById("basketTop");
  if (basketTop) {
    basketTop.classList.add("basket-glow-pulse");
    setTimeout(() => basketTop.classList.remove("basket-glow-pulse"), 600);
  }
}

function _shakeBasketUI() {
  updateBasketCountUI();
  const basketTop = document.getElementById("basketTop");
  if (basketTop) {
    basketTop.classList.add("shake");
    setTimeout(() => basketTop.classList.remove("shake"), 400);
  }
}

// Removes a set of varNames from the basket in one write, returning the
// full {varName,label} items that were actually removed (for toast/undo).
function _removeBasketItems(varNames) {
  const removeSet = new Set(varNames);
  const basket = loadBasket();
  const removedItems = basket.filter(item => removeSet.has(item.varName));
  if (removedItems.length === 0) return [];
  const remaining = basket.filter(item => !removeSet.has(item.varName));
  saveBasket(remaining);
  return removedItems;
}

function addToBasket(varName, label, opts) {
  opts = opts || {};
  _upsertBasketItems([{ varName, label }]);
  _pulseBasketUI();

  if (opts.expandSiblings !== false && getAutoAddSiblings()) {
    expandBasketItemsWithSiblings([varName]).then(siblingItems => {
      if (siblingItems.length === 0) return;
      const addedNames = _upsertBasketItems(siblingItems);
      if (addedNames.length > 0) {
        _pulseBasketUI();
        const addedItems = siblingItems.filter(i => addedNames.includes(i.varName));
        showLinkedSweepsToast(addedItems, "added");
      }
    });
  }
}

function removeFromBasket(varName, opts) {
  opts = opts || {};
  _removeBasketItems([varName]);
  _shakeBasketUI();

  if (opts.expandSiblings !== false && getAutoAddSiblings()) {
    loadLongitudinalSiblings().then(map => {
      const siblings = map.get(varName);
      if (!siblings || siblings.length === 0) return;
      const removedItems = _removeBasketItems(siblings.map(s => s.varName));
      if (removedItems.length > 0) {
        _shakeBasketUI();
        showLinkedSweepsToast(removedItems, "removed");
      }
    });
  }
}

// ── Batch basket operations ─────────────────────────────────────────────────
// For adding/removing many variables at once (e.g. "Add all visible").
// Reads localStorage ONCE, modifies the full array in memory, writes ONCE,
// then updates the UI once. Avoids N reads + N writes + N animations.
// Use these in any "add all" / "remove all" handler instead of looping
// addToBasket() / removeFromBasket().

function batchAddToBasket(items, opts) {
  // items = [{ varName, label }, ...]
  opts = opts || {};
  if (!items || items.length === 0) return [];
  const addedNames = _upsertBasketItems(items);
  _pulseBasketUI();

  if (opts.expandSiblings !== false && getAutoAddSiblings()) {
    const varNames = items.map(i => i.varName).filter(Boolean);
    expandBasketItemsWithSiblings(varNames).then(siblingItems => {
      if (siblingItems.length === 0) return;
      const siblingAdded = _upsertBasketItems(siblingItems);
      if (siblingAdded.length > 0) {
        _pulseBasketUI();
        const addedItems = siblingItems.filter(i => siblingAdded.includes(i.varName));
        showLinkedSweepsToast(addedItems, "added");
      }
    });
  }

  return addedNames;
}

function batchRemoveFromBasket(varNames, opts) {
  // varNames = ["ht82", "wt82", ...]
  opts = opts || {};
  if (!varNames || varNames.length === 0) return;
  _removeBasketItems(varNames);
  _shakeBasketUI();

  if (opts.expandSiblings !== false && getAutoAddSiblings()) {
    expandBasketItemsWithSiblings(varNames).then(siblingItems => {
      if (siblingItems.length === 0) return;
      const removedItems = _removeBasketItems(siblingItems.map(s => s.varName));
      if (removedItems.length > 0) {
        _shakeBasketUI();
        showLinkedSweepsToast(removedItems, "removed");
      }
    });
  }
}

// ── Site-wide checkbox sync ─────────────────────────────────────────────────
// Runs on every basket change, on every page. Deliberately lightweight —
// only toggles checked/class state on existing DOM nodes already on the
// page, no re-rendering, no re-fetching. The site has grown a few different
// checkbox conventions across pages built at different times, so this
// covers all of them:
//   data-varname="xyz"              longitudinal page, single variable
//   data-varnames="a,b,c"           longitudinal page, grouped row checkbox,
//                                    gets check-full / check-partial classes
//   data-var-name="xyz"             Search Data Dictionary page
//   data-name="xyz"                 View Popular / Browse by Category pages
//   data-var="xyz"                  Documentation pages
// Any future page just needs to use one of these — no extra JS required.
function refreshBasketCheckboxesUI() {
  const basketSet = new Set(loadBasket().map(item => item.varName));

  document.querySelectorAll('input[type="checkbox"][data-varname]').forEach(cb => {
    const vn = cb.dataset.varname;
    if (!vn) return;
    cb.checked = basketSet.has(vn);
  });

  document.querySelectorAll('input[type="checkbox"][data-varnames]').forEach(cb => {
    const names = (cb.dataset.varnames || "").split(",").filter(Boolean);
    if (names.length === 0) return;
    const inCount = names.filter(n => basketSet.has(n)).length;
    cb.classList.remove("check-full", "check-partial");
    if (inCount === names.length) {
      cb.checked = true;
      cb.classList.add("check-full");
    } else if (inCount > 0) {
      cb.checked = false;
      cb.classList.add("check-partial");
    } else {
      cb.checked = false;
    }
  });

  document.querySelectorAll('input[type="checkbox"][data-var-name]').forEach(cb => {
    const vn = cb.dataset.varName;
    if (!vn) return;
    cb.checked = basketSet.has(vn);
  });

  document.querySelectorAll('input[type="checkbox"][data-name]').forEach(cb => {
    const vn = cb.dataset.name;
    if (!vn) return;
    cb.checked = basketSet.has(vn);
  });

  document.querySelectorAll('input[type="checkbox"][data-var]').forEach(cb => {
    const vn = cb.dataset.var;
    if (!vn) return;
    cb.checked = basketSet.has(vn);
  });
}

window.addEventListener("nshd-basket-changed", refreshBasketCheckboxesUI);

document.addEventListener("DOMContentLoaded", () => {
  const wrapper = document.getElementById("basketWrapper");
  const basket = document.getElementById("basketTop");
  const dropdown = document.getElementById("basketDropdown");
  if (!wrapper || !basket || !dropdown) return;

  // ── Move basket icon into the site header, next to the OWL title ──────────
  // Inserts into .site-header after .site-title so the basket sits at the
  // same vertical level as the site logo/title and is always visible since
  // the header is sticky/fixed in Just-the-Docs. The dropdown opens
  // downward-right so it stays on screen.
  const siteHeader = document.querySelector(".site-header");
  const siteTitle  = document.querySelector(".site-title");

  if (siteHeader && siteTitle) {
    // Place basket immediately after OWL title
    // marginRight gives the right-edge glow breathing room
    wrapper.style.display = "inline-flex";
    wrapper.style.marginRight = "8px";
    wrapper.classList.add("basket-sidebar-pinned");
    siteTitle.insertAdjacentElement("afterend", wrapper);
  } else if (siteHeader) {
    wrapper.style.display = "inline-flex";
    wrapper.style.marginRight = "8px";
    wrapper.classList.add("basket-sidebar-pinned");
    siteHeader.insertAdjacentElement("beforeend", wrapper);
  } else {
    // Fallback: next to search bar
    let searchBox = document.querySelector(".search");
    if (!searchBox) {
      const searchInput = document.querySelector("input[type='search']");
      if (searchInput) searchBox = searchInput.parentElement;
    }
    if (searchBox) {
      wrapper.style.display = "inline-block";
      searchBox.insertAdjacentElement("afterend", wrapper);
    }
  }

  updateBasketCountUI();

  // ── Sync linked sweeps toggle, placed right next to the basket icon ──
  const autoAddToggle = document.createElement("label");
  autoAddToggle.id = "autoAddSiblingsToggle";
  autoAddToggle.title = "Syncs sweeps of the same longitudinal variable. Automatically adds and removes sibling variables in your basket.";
  Object.assign(autoAddToggle.style, {
    display: "inline-flex", alignItems: "center", gap: "8px",
    fontSize: "11px", color: "#555", marginRight: "10px", cursor: "pointer", userSelect: "none"
  });

  const autoAddInput = document.createElement("input");
  autoAddInput.type = "checkbox";
  autoAddInput.checked = getAutoAddSiblings();
  // Visually hidden but still focusable/clickable/keyboard-operable — the
  // label wraps it, so native checkbox behavior (space to toggle, click
  // anywhere in the label) keeps working; only the visible track/thumb
  // below are styled to look like a switch.
  Object.assign(autoAddInput.style, {
    position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px",
    overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: "0"
  });

  const track = document.createElement("span");
  Object.assign(track.style, {
    width: "30px", height: "17px", borderRadius: "10px", position: "relative",
    display: "inline-block", flexShrink: "0", transition: "background 0.15s",
    background: autoAddInput.checked ? "#6a0dad" : "#ccc"
  });
  const thumb = document.createElement("span");
  Object.assign(thumb.style, {
    width: "13px", height: "13px", borderRadius: "50%", background: "#fff",
    position: "absolute", top: "2px", transition: "left 0.15s",
    left: autoAddInput.checked ? "15px" : "2px"
  });
  track.appendChild(thumb);

  autoAddInput.addEventListener("change", () => {
    setAutoAddSiblings(autoAddInput.checked);
    track.style.background = autoAddInput.checked ? "#6a0dad" : "#ccc";
    thumb.style.left = autoAddInput.checked ? "15px" : "2px";
    window.dispatchEvent(new CustomEvent("nshd-sync-toggle-changed", { detail: { on: autoAddInput.checked } }));
  });
  autoAddInput.addEventListener("focus", () => { track.style.boxShadow = "0 0 0 2px rgba(106,13,173,0.35)"; });
  autoAddInput.addEventListener("blur",  () => { track.style.boxShadow = "none"; });

  const autoAddText = document.createElement("span");
  autoAddText.textContent = "Sync linked sweeps";
  autoAddToggle.appendChild(autoAddInput);
  autoAddToggle.appendChild(track);
  autoAddToggle.appendChild(autoAddText);
  wrapper.insertAdjacentElement("afterend", autoAddToggle);

  // ⭐ Dropdown preview on hover
  // Uses a hide-delay so the dropdown stays open long enough for the
  // user to move the cursor from the basket icon into the dropdown and
  // click links — without a delay, mouseleave fires immediately and
  // hides the dropdown before any click can register.
  let hideTimer = null;

  // ── Move dropdown to <body> so it escapes the header's stacking context ──
  // The sidebar header creates its own stacking context, so any child
  // z-index is capped within it — the nav always wins. Moving the dropdown
  // to document.body lets it sit above everything on the page.
  document.body.appendChild(dropdown);

  function positionDropdown() {
    const rect = wrapper.getBoundingClientRect();
    dropdown.style.position   = "fixed";
    dropdown.style.top        = rect.bottom + "px";
    dropdown.style.right      = (window.innerWidth - rect.right) + "px";
    dropdown.style.left       = "auto";
    dropdown.style.zIndex     = "999999";
    dropdown.style.minWidth   = "240px";
    dropdown.style.background = "#ffffff";
    dropdown.style.border     = "1px solid #ddd";
    dropdown.style.borderRadius = "6px";
    dropdown.style.boxShadow  = "0 4px 12px rgba(0,0,0,0.18)";
  }

  function showDropdown() {
    clearTimeout(hideTimer);
    const items = loadBasket();
    const lastFive = items.slice(-5).reverse();
    if (lastFive.length === 0) {
      dropdown.style.display = "none";
      return;
    }
    dropdown.innerHTML = `
      <div style="background:#ffffff;padding:6px 12px;font-size:12px;font-weight:600;color:#4b067a;border-bottom:1px solid #e0d0f0;">Last 5 variables added:</div>
      ${lastFive.map(i => `
        <div style="background:#ffffff;padding:5px 12px;font-size:12px;">
          <a href="https://rmjdish.github.io/OWL/assets/variable_metadata/${i.varName}"
             target="_blank"
             style="color:#4b067a;text-decoration:underline;">
            ${i.varName}
          </a>
        </div>
      `).join("")}
      <a href="/OWL/docs/baskets/basket.html"
         style="display:block;background:#f3e8ff;padding:7px 12px;font-size:12px;font-weight:500;color:#4b067a;border-top:1px solid #e0d0f0;text-decoration:none;">
        View full basket →
      </a>
    `;
    positionDropdown();
    dropdown.style.display = "block";
  }

  function hideDropdown() {
    hideTimer = setTimeout(() => {
      dropdown.style.display = "none";
    }, 500);
  }

  wrapper.addEventListener("mouseenter", showDropdown);
  wrapper.addEventListener("mouseleave", hideDropdown);

  // Keep dropdown open when cursor moves into it
  dropdown.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  dropdown.addEventListener("mouseleave", hideDropdown);

  basket.addEventListener("click", () => {
    window.location = "/OWL/docs/baskets/basket.html";
  });
});