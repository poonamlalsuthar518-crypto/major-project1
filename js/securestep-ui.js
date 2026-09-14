document.addEventListener('DOMContentLoaded', function () {
  const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.nav a, .sidebar a').forEach(link => {
    const href = link.getAttribute('href');
    if (href && href === currentPage) {
      link.classList.add('active');
    }
  });

  const yearNode = document.getElementById('year');
  if (yearNode) yearNode.textContent = new Date().getFullYear();

  const timerEl = document.getElementById('countdownTimer');
  if (timerEl) {
    let seconds = 10;
    const tick = () => {
      timerEl.textContent = `${seconds}s`;
      seconds -= 1;
      if (seconds < 0) {
        timerEl.textContent = 'SOS Sent';
        clearInterval(interval);
      }
    };
    const interval = setInterval(tick, 1000);
    tick();
  }

  document.querySelectorAll('[data-action="mark-read"]').forEach(button => {
    button.addEventListener('click', () => {
      const item = button.closest('.notification-item');
      if (item) item.classList.toggle('read');
      button.textContent = 'Read';
      button.disabled = true;
    });
  });

  document.querySelectorAll('[data-action="delete"]').forEach(button => {
    button.addEventListener('click', () => {
      const card = button.closest('.notification-item, .contact-card, .report-item');
      if (card) card.remove();
    });
  });

  const contactSearch = document.getElementById('contactSearch');
  if (contactSearch) {
    contactSearch.addEventListener('input', function () {
      const term = this.value.toLowerCase();
      document.querySelectorAll('.contact-card').forEach(card => {
        const name = (card.dataset.name || card.querySelector('h4')?.textContent || '').toLowerCase();
        card.style.display = name.includes(term) ? '' : 'none';
      });
    });
  }

  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    item.addEventListener('toggle', () => {
      if (item.open) {
        faqItems.forEach(other => { if (other !== item) other.removeAttribute('open'); });
      }
    });
  });

  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const status = document.createElement('div');
      status.className = 'alert-box';
      status.textContent = 'Submitted successfully.';
      form.appendChild(status);
      setTimeout(() => status.remove(), 2200);
    });
  });
});
