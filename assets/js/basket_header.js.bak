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

function addToBasket(varName, label) {
  const basket = loadBasket();
  if (!basket.some(item => item.varName === varName)) {
    basket.push({ varName, label });
    saveBasket(basket);
  }
  updateBasketCountUI();

  // ⭐ Pulse animation on count
  const badge = document.getElementById("basketCount");
  if (badge) {
    badge.classList.add("added");
    setTimeout(() => badge.classList.remove("added"), 400);
  }

  // ⭐ Glow pulse on basket icon
  const basketTop = document.getElementById("basketTop");
  if (basketTop) {
    basketTop.classList.add("basket-glow-pulse");
    setTimeout(() => basketTop.classList.remove("basket-glow-pulse"), 600);
  }
}

function removeFromBasket(varName) {
  let basket = loadBasket();
  basket = basket.filter(item => item.varName !== varName);
  saveBasket(basket);
  updateBasketCountUI();

  // ⭐ Shake animation on removal
  const basketTop = document.getElementById("basketTop");
  if (basketTop) {
    basketTop.classList.add("shake");
    setTimeout(() => basketTop.classList.remove("shake"), 400);
  }
}

// ── Batch basket operations ─────────────────────────────────────────────────
// For adding/removing many variables at once (e.g. "Add all visible").
// Reads localStorage ONCE, modifies the full array in memory, writes ONCE,
// then updates the UI once. Avoids N reads + N writes + N animations.
// Use these in any "add all" / "remove all" handler instead of looping
// addToBasket() / removeFromBasket().

function batchAddToBasket(items) {
  // items = [{ varName, label }, ...]
  if (!items || items.length === 0) return;
  const basket = loadBasket();
  const existing = new Set(basket.map(i => i.varName));
  items.forEach(({ varName, label }) => {
    if (varName && !existing.has(varName)) {
      basket.push({ varName, label });
      existing.add(varName);
    }
  });
  saveBasket(basket);
  updateBasketCountUI();

  // Single pulse after the whole batch
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

function batchRemoveFromBasket(varNames) {
  // varNames = ["ht82", "wt82", ...]
  if (!varNames || varNames.length === 0) return;
  const removeSet = new Set(varNames);
  let basket = loadBasket();
  basket = basket.filter(item => !removeSet.has(item.varName));
  saveBasket(basket);
  updateBasketCountUI();

  const basketTop = document.getElementById("basketTop");
  if (basketTop) {
    basketTop.classList.add("shake");
    setTimeout(() => basketTop.classList.remove("shake"), 400);
  }
}

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