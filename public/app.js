// Navigation
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  const navBtn = document.querySelector(`.nav-btn[data-section="${name}"]`);
  if (navBtn) navBtn.classList.add('active');

  // Load data when switching sections
  if (name === 'swimmers') loadSwimmers();
  if (name === 'log-meters') { loadSwimmersDropdown(); loadMetersLog(); }
  if (name === 'dashboard') loadDashboard();
}

// Toast notifications
function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type + ' show';
  setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// Format number with dots as thousands separator
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// === SWIMMERS ===
async function loadSwimmers() {
  try {
    const res = await fetch('/api/swimmers');
    const swimmers = await res.json();
    const tbody = document.getElementById('swimmers-tbody');
    const noMsg = document.getElementById('no-swimmers');

    if (swimmers.length === 0) {
      tbody.innerHTML = '';
      noMsg.style.display = 'block';
      return;
    }

    noMsg.style.display = 'none';
    tbody.innerHTML = swimmers.map(s => `
      <tr>
        <td>${escapeHtml(s.first_name)}</td>
        <td>${escapeHtml(s.last_name)}</td>
        <td>${s.category || '-'}</td>
        <td>${formatDate(s.created_at)}</td>
        <td><button class="btn btn-danger" onclick="deleteSwimmer(${s.id}, '${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}')">Eliminar</button></td>
      </tr>
    `).join('');
  } catch (err) {
    showToast('Error al cargar nadadores', 'error');
  }
}

document.getElementById('swimmer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    first_name: document.getElementById('first_name').value.trim(),
    last_name: document.getElementById('last_name').value.trim(),
    category: document.getElementById('category').value || null
  };

  try {
    const res = await fetch('/api/swimmers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    showToast('Nadador registrado exitosamente', 'success');
    e.target.reset();
    loadSwimmers();
  } catch (err) {
    showToast(err.message || 'Error al registrar nadador', 'error');
  }
});

async function deleteSwimmer(id, name) {
  if (!confirm(`¿Estás seguro de eliminar a ${name}? Se eliminarán también todos sus registros de metros.`)) return;
  try {
    const res = await fetch(`/api/swimmers/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    showToast('Nadador eliminado', 'success');
    loadSwimmers();
  } catch (err) {
    showToast('Error al eliminar nadador', 'error');
  }
}

// === METERS LOG ===
async function loadSwimmersDropdown() {
  try {
    const res = await fetch('/api/swimmers');
    const swimmers = await res.json();
    const select = document.getElementById('swimmer_select');
    select.innerHTML = '<option value="">Seleccionar nadador...</option>' +
      swimmers.map(s => `<option value="${s.id}">${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</option>`).join('');
  } catch (err) {
    showToast('Error al cargar nadadores', 'error');
  }
}

async function loadMetersLog() {
  try {
    const res = await fetch('/api/meters');
    const logs = await res.json();
    const tbody = document.getElementById('meters-tbody');
    const noMsg = document.getElementById('no-meters');

    if (logs.length === 0) {
      tbody.innerHTML = '';
      noMsg.style.display = 'block';
      return;
    }

    noMsg.style.display = 'none';
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td>${formatDate(l.session_date)}</td>
        <td>${escapeHtml(l.first_name)} ${escapeHtml(l.last_name)}</td>
        <td><strong>${formatNumber(l.meters)}</strong> m</td>
        <td>${l.notes ? escapeHtml(l.notes) : '-'}</td>
      </tr>
    `).join('');
  } catch (err) {
    showToast('Error al cargar registros', 'error');
  }
}

document.getElementById('meters-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    swimmer_id: parseInt(document.getElementById('swimmer_select').value),
    meters: parseInt(document.getElementById('meters').value),
    session_date: document.getElementById('session_date').value,
    notes: document.getElementById('notes').value.trim() || null
  };

  try {
    const res = await fetch('/api/meters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    showToast('Metros registrados exitosamente', 'success');
    document.getElementById('meters').value = '';
    document.getElementById('notes').value = '';
    loadMetersLog();
  } catch (err) {
    showToast(err.message || 'Error al registrar metros', 'error');
  }
});

// Set default date to today
document.getElementById('session_date').valueAsDate = new Date();

// === DASHBOARD ===
async function loadDashboard() {
  try {
    const res = await fetch('/api/summary');
    const data = await res.json();

    document.getElementById('total-meters').textContent = formatNumber(data.total_meters);
    document.getElementById('total-percentage').textContent = data.percentage + '%';
    document.getElementById('total-swimmers').textContent = data.swimmer_count;
    document.getElementById('remaining-meters').textContent = formatNumber(Math.max(data.goal - data.total_meters, 0));

    // Animate progress bar
    const bar = document.getElementById('progress-bar');
    setTimeout(() => { bar.style.width = data.percentage + '%'; }, 100);

    // Ranking table
    const tbody = document.getElementById('ranking-tbody');
    if (data.by_swimmer.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">No hay datos aún</td></tr>';
      return;
    }

    tbody.innerHTML = data.by_swimmer.map((s, i) => {
      let rankClass = '';
      if (i === 0) rankClass = 'rank-gold';
      else if (i === 1) rankClass = 'rank-silver';
      else if (i === 2) rankClass = 'rank-bronze';
      return `
        <tr>
          <td><span class="rank-number ${rankClass}">${i + 1}</span></td>
          <td>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</td>
          <td>${s.category || '-'}</td>
          <td>${s.total_sessions}</td>
          <td><strong>${formatNumber(s.total_meters)}</strong> m</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast('Error al cargar dashboard', 'error');
  }
}

// === HELPERS ===
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
