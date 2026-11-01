/* Scroll spy */
function updateActiveSection() {
  const sections = document.querySelectorAll("h2[id]");
  const midpoint = window.innerHeight / 2;
  let current = "";

  sections.forEach(sec => {
    const rect = sec.getBoundingClientRect();
    if (rect.top <= midpoint && rect.bottom >= midpoint) {
      current = sec.id;
    }
  });

  document.querySelectorAll(".sidebar-summary a").forEach(a => {
    a.classList.toggle("active", a.getAttribute("href") === "#" + current);
  });
}

/* Back to top button */
window.addEventListener("scroll", () => {
  const btn = document.getElementById("back-to-top");
  btn.style.display = window.scrollY > 300 ? "block" : "none";
});
document.getElementById("back-to-top").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });

document.addEventListener("scroll", updateActiveSection);
document.addEventListener("DOMContentLoaded", updateActiveSection);
window.addEventListener("resize", updateActiveSection);

/* Rewrite Linked Variables table links */
function rewriteLinkedVariableLinks() {
  const table = document.querySelector("#linked-variables-table");
  if (!table) return;

  const rows = table.querySelectorAll("tr");

  rows.forEach(row => {
    const firstCell = row.querySelector("td");
    if (!firstCell) return;

    const link = firstCell.querySelector("a");
    if (!link) return;

    const variableName = link.textContent.trim();
    if (!variableName) return;

    // Build new URL
    const newUrl = `https://rmjdish.github.io/OWL/assets/variable_metadata/${variableName}.html`;

    // Update the link
    link.href = newUrl;
  });
}

document.addEventListener("DOMContentLoaded", rewriteLinkedVariableLinks);

