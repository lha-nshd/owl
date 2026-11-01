/*
 * OWL — Combined icon key
 * /OWL/assets/js/variable-icon-key.js
 *
 * ONE shared bar replacing the separate doc / restricted / longitudinal legends.
 * It owns the text, order and markup of the key. The three icon scripts no
 * longer build a legend; each just reports whether its icon is currently on
 * the page:
 *
 *     window.OWLIconKey.update('restricted', true);   // icon(s) present
 *     window.OWLIconKey.update('restricted', false);  // none left
 *
 * The bar shows only the items currently reported present, always in the order
 * doc -> restricted -> longitudinal, and removes itself when none are.
 *
 * LOAD ORDER in head_custom.html: this file BEFORE the three icon scripts.
 */
(function () {
  if (window.OWLIconKey) return;

  var ITEMS = [
    { id: 'doc', icon: 'ti-info-circle', label: 'Documentation',
      tip: 'Documentation exists for this variable — hover the icon to check, click to view it.' },
    { id: 'restricted', icon: 'ti-lock', label: 'Restricted access',
      tip: 'This variable has an access restriction — hover the icon to see why and how to request it.' },
    { id: 'longitudinal', icon: 'ti-link', label: 'Longitudinal',
      tip: 'Measured at more than one sweep — hover the icon to see how many variables are linked, click to view them.' }
  ];

  var present = {};
  var timer = null;

  function render() {
    var shown = ITEMS.filter(function (it) { return present[it.id]; });
    var bar = document.querySelector('.var-icon-key');

    if (!shown.length) { if (bar) bar.remove(); return; }

    var anchor = document.querySelector('.hero-banner');
    if (!anchor) return;

    var html = '<span class="var-icon-key-title">Icon key</span>' +
      shown.map(function (it) {
        return '<span class="var-icon-key-item var-icon-key-' + it.id + '" tabindex="0" ' +
               'title="' + it.tip + '"><i class="ti ' + it.icon + '" aria-hidden="true"></i>' +
               it.label + '</span>';
      }).join('');

    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'var-icon-key';
      anchor.insertAdjacentElement('afterend', bar);
    }
    // Rewrite only when the set changed, so tooltips aren't reset mid-hover
    var sig = shown.map(function (it) { return it.id; }).join(',');
    if (bar.dataset.sig !== sig) { bar.innerHTML = html; bar.dataset.sig = sig; }
  }

  window.OWLIconKey = {
    update: function (id, isPresent) {
      if (!!present[id] === !!isPresent) return;
      present[id] = !!isPresent;
      // Several scripts report in the same tick: draw once
      clearTimeout(timer);
      timer = setTimeout(render, 0);
    }
  };
})();
