/*
 Emergency Contacts Management System — SecureStep
 API-first (MySQL via /api/emergency-contacts).
 Falls back to localStorage when no user session or DB unavailable.
*/

class EmergencyContactsManager {
    constructor() {
        this.contacts = [];
        this.userId   = this.getCurrentUserId();
        this._loaded  = false;
        this.loadContacts();
    }

    getCurrentUserId() {
        try {
            const u = JSON.parse(localStorage.getItem('secureStepUser') || 'null');
            if (u && (u.id || u.user_id)) return u.id || u.user_id;
            const email = localStorage.getItem('secureStepUserEmail');
            if (email) return email;
            const name = localStorage.getItem('secureStepUserName');
            if (name) return name.replace(/\s+/g, '_').toLowerCase();
            return 'default_user';
        } catch { return 'default_user'; }
    }

    /* ── localStorage helpers (fallback) ── */
    _lsKey()  { return 'secureStepContacts_' + (this.userId || 'guest'); }
    _lsLoad() {
        try { return JSON.parse(localStorage.getItem(this._lsKey()) || '[]'); }
        catch { return []; }
    }
    _lsSave(contacts) {
        localStorage.setItem(this._lsKey(), JSON.stringify(contacts));
    }
    _nextLsId(contacts) {
        return contacts.reduce((max, c) => Math.max(max, c.id || 0), 0) + 1;
    }

    /* ── Load ── */
    async loadContacts() {
        if (this.userId) {
            try {
                const res  = await fetch(`/api/emergency-contacts/${this.userId}`);
                const data = await res.json();
                if (data.success) {
                    this.contacts = data.contacts.map(c => ({
                        id:           c.id,
                        name:         c.name,
                        phone:        c.phone,
                        email:        c.email || '',
                        relationship: c.relationship || 'Other',
                        priority:     c.is_primary ? 'priority' : 'standard',
                        createdAt:    c.created_at
                    }));
                    this._lsSave(this.contacts); // keep local copy in sync
                    this._loaded = true;
                    return;
                }
            } catch (e) {
                console.warn('API load failed, using localStorage:', e);
            }
        }
        // fallback
        this.contacts = this._lsLoad();
        this._loaded  = true;
    }

    /* ── Add ── */
    async addContact(contact) {
        if (this.userId) {
            try {
                const res  = await fetch('/api/emergency-contacts', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        userId:       this.userId,
                        name:         contact.name,
                        phone:        contact.phone,
                        email:        contact.email || null,
                        relationship: contact.relationship,
                        isPrimary:    contact.priority === 'priority'
                    })
                });
                const data = await res.json();
                if (data.success) { await this.loadContacts(); return data.id; }
                throw new Error(data.message || 'API error');
            } catch (e) { console.warn('API add failed, using localStorage:', e); }
        }
        // localStorage fallback
        const all     = this._lsLoad();
        const newItem = {
            id:           this._nextLsId(all),
            name:         contact.name,
            phone:        contact.phone,
            email:        contact.email || '',
            relationship: contact.relationship,
            priority:     contact.priority || 'standard',
            createdAt:    new Date().toISOString()
        };
        all.push(newItem);
        this._lsSave(all);
        this.contacts = all;
        return newItem.id;
    }

    /* ── Update ── */
    async updateContact(id, updated) {
        if (this.userId) {
            try {
                const res  = await fetch(`/api/emergency-contacts/${id}`, {
                    method:  'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        name:         updated.name,
                        phone:        updated.phone,
                        email:        updated.email || null,
                        relationship: updated.relationship,
                        isPrimary:    updated.priority === 'priority'
                    })
                });
                const data = await res.json();
                if (data.success) { await this.loadContacts(); return true; }
                throw new Error(data.message || 'API error');
            } catch (e) { console.warn('API update failed, using localStorage:', e); }
        }
        // localStorage fallback
        const all = this._lsLoad();
        const idx = all.findIndex(c => c.id === id);
        if (idx > -1) {
            all[idx] = { ...all[idx], ...updated };
            this._lsSave(all);
            this.contacts = all;
        }
        return true;
    }

    /* ── Delete ── */
    async deleteContact(id) {
        if (this.userId) {
            try {
                const res  = await fetch(`/api/emergency-contacts/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) { await this.loadContacts(); return true; }
                throw new Error(data.message || 'API error');
            } catch (e) { console.warn('API delete failed, using localStorage:', e); }
        }
        // localStorage fallback
        const all = this._lsLoad().filter(c => c.id !== id);
        this._lsSave(all);
        this.contacts = all;
        return true;
    }

    /* ── Getters ── */
    getContact(id)        { return this.contacts.find(c => c.id === id); }
    getAllContacts()       { return this.contacts; }
    getPriorityContacts() { return this.contacts.filter(c => c.priority === 'priority'); }
    searchContacts(query) {
        const q = query.toLowerCase();
        return this.contacts.filter(c =>
            c.name.toLowerCase().includes(q) ||
            c.phone.includes(q) ||
            (c.relationship || '').toLowerCase().includes(q)
        );
    }
}

// ─── Global instance ───────────────────────────────────────────────────────
const emergencyContacts = new EmergencyContactsManager();

// ─── Modal helpers ─────────────────────────────────────────────────────────
function showAddContactModal() {
    document.getElementById('modalTitle').textContent = 'Add Emergency Contact';
    document.getElementById('contactForm').reset();
    document.getElementById('contactId').value = '';
    document.getElementById('contactModal').classList.add('active');
}

function showEditContactModal(id) {
    const c = emergencyContacts.getContact(id);
    if (!c) return;
    document.getElementById('modalTitle').textContent      = 'Edit Emergency Contact';
    document.getElementById('contactId').value             = c.id;
    document.getElementById('contactName').value           = c.name;
    document.getElementById('contactPhone').value          = c.phone;
    document.getElementById('contactEmail').value          = c.email || '';
    document.getElementById('contactRelationship').value   = c.relationship;
    document.getElementById('contactPriority').value       = c.priority;
    document.getElementById('contactModal').classList.add('active');
}

function hideContactModal() {
    document.getElementById('contactModal').classList.remove('active');
}

async function saveContact(event) {
    event.preventDefault();
    const id          = document.getElementById('contactId').value;
    const contactData = {
        name:         document.getElementById('contactName').value.trim(),
        phone:        document.getElementById('contactPhone').value.trim(),
        email:        document.getElementById('contactEmail').value.trim(),
        relationship: document.getElementById('contactRelationship').value,
        priority:     document.getElementById('contactPriority').value
    };
    if (!contactData.name || !contactData.phone || !contactData.relationship) {
        alert('Name, phone and relationship are required.'); return;
    }
    try {
        if (id) {
            await emergencyContacts.updateContact(parseInt(id), contactData);
        } else {
            await emergencyContacts.addContact(contactData);
        }
        hideContactModal();
        renderContacts();
        window.dispatchEvent(new CustomEvent('emergencyContactsUpdated'));
    } catch (e) {
        alert('Failed to save contact: ' + e.message);
    }
}

async function deleteContact(id) {
    if (!confirm('Are you sure you want to delete this emergency contact?')) return;
    try {
        await emergencyContacts.deleteContact(id);
        renderContacts();
        window.dispatchEvent(new CustomEvent('emergencyContactsUpdated'));
    } catch (e) {
        alert('Failed to delete contact: ' + e.message);
    }
}

// ─── Render ────────────────────────────────────────────────────────────────
function renderContacts(contactsToRender = null) {
    const contacts = contactsToRender || emergencyContacts.getAllContacts();
    const grid     = document.getElementById('contactsGrid');
    if (!grid) return;

    if (contacts.length === 0) {
        grid.innerHTML = `
          <div style="grid-column:1/-1;text-align:center;padding:48px 20px;color:#64748b;">
            <i class="fas fa-address-book" style="font-size:48px;margin-bottom:16px;opacity:0.3;"></i>
            <p style="font-size:16px;font-weight:600;">No emergency contacts yet</p>
            <p style="font-size:14px;margin-top:6px;">Add your trusted contacts — they will be alerted during SOS emergencies.</p>
          </div>`;
        const el = document.getElementById('contactCount');
        if (el) el.textContent = '0';
        return;
    }

    grid.innerHTML = contacts.map(c => {
        const badge = c.priority === 'priority' ? 'safe' : 'warning';
        const label = c.priority === 'priority' ? 'Priority' : c.priority === 'trusted' ? 'Trusted' : 'Standard';
        const icon  = c.relationship === 'Emergency Service' ? 'fa-user-shield' : 'fa-user';
        return `
          <div class="contact-card" data-name="${c.name.toLowerCase()}">
            <div class="contact-top">
              <div class="icon"><i class="fas ${icon}"></i></div>
              <div class="contact-details">
                <h4>${c.name}</h4>
                <div style="color:var(--muted);">${c.phone}</div>
                ${c.email ? `<div style="color:var(--muted);font-size:12px;">${c.email}</div>` : ''}
              </div>
            </div>
            <div class="meta-row">
              <span><strong>Relationship:</strong> ${c.relationship || 'Other'}</span>
              <span class="badge ${badge}">${label}</span>
            </div>
            <div class="table-actions" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:12px;">
              <a href="tel:${c.phone}" style="padding:6px 12px;background:#f0fdf4;border-radius:8px;color:#10b981;font-weight:700;font-size:13px;text-decoration:none;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-phone"></i> Call</a>
              <button type="button" onclick="showEditContactModal(${c.id})"><i class="fas fa-pen"></i> Edit</button>
              <button type="button" onclick="deleteContact(${c.id})" data-action="delete"><i class="fas fa-trash"></i> Delete</button>
            </div>
          </div>`;
    }).join('');

    const el = document.getElementById('contactCount');
    if (el) el.textContent = contacts.length;
}

function filterContacts() {
    const q = document.getElementById('contactSearch').value;
    renderContacts(emergencyContacts.searchContacts(q));
}

// ─── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Contacts may still be loading asynchronously
    if (!emergencyContacts._loaded) {
        await emergencyContacts.loadContacts();
    }
    renderContacts();
});

// ─── Global exports ────────────────────────────────────────────────────────
window.showAddContactModal  = showAddContactModal;
window.showEditContactModal = showEditContactModal;
window.hideContactModal     = hideContactModal;
window.saveContact          = saveContact;
window.deleteContact        = deleteContact;
window.filterContacts       = filterContacts;
window.emergencyContacts    = emergencyContacts;
