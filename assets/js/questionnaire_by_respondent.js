/* ============================================================
   NSHD Questionnaire Sub-page by respondent
   ============================================================ */
 
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.page-questionnaire_by_respondent .sec-trigger').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      this.nextElementSibling.classList.toggle('open', !expanded);
    });
  });
});
