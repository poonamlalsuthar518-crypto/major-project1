/*
 Emergency SOS Module — SecureStep
 Complete implementation of:
 - Safety Event Duration Timer
 - "Are you safe?" Confirmation Modal (YES / NO / 60s timeout)
 - Emergency Mode with Real-Time GPS Tracking, Google Maps integration,
   backend persistence, protected emergency session token, and user emergency contacts.
*/

class EmergencySOS {
    constructor() {
        this.isActive                 = false;
        this.contacts                 = [];
        this.currentLocation          = null;
        this.watchPositionId          = null;
        this.durationTimer            = null;
        this.locationTrackingInterval = null;
        this.sosId                    = null;
        this.sosToken                 = null;
        this.shareUrl                 = null;
        this.activeSosMap             = null;
        this.activeSosMarker          = null;
        this.safetyCheckSchedule      = null;
        this.safetyCheckInterval      = null;
        this.safetyCheckTimer         = null;
        this.isSafetyCheckActive      = false;
    }

    // ── User identity ────────────────────────────────────────────────────────
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

    getCurrentUserName() {
        try {
            const u = JSON.parse(localStorage.getItem('secureStepUser') || 'null');
            if (u && (u.fullName || u.full_name)) return u.fullName || u.full_name;
            const name = localStorage.getItem('secureStepUserName');
            if (name) return name;
            return 'SecureStep User';
        } catch { return 'SecureStep User'; }
    }

    // ── Load user's saved emergency contacts ─────────────────────────────────
    async initializeContacts() {
        if (window.emergencyContacts) {
            if (!window.emergencyContacts._loaded) {
                await window.emergencyContacts.loadContacts();
            }
            this.contacts = window.emergencyContacts.getAllContacts();
        } else {
            const userId = this.getCurrentUserId();
            try {
                const res = await fetch(`/api/emergency-contacts/${userId}`);
                const data = await res.json();
                if (data.success && Array.isArray(data.contacts)) {
                    this.contacts = data.contacts.map(c => ({
                        id: c.id,
                        name: c.name,
                        phone: c.phone,
                        email: c.email || '',
                        relationship: c.relationship || 'Other',
                        priority: c.is_primary ? 'priority' : 'standard'
                    }));
                }
            } catch (e) {
                console.warn('Emergency contacts API fetch failed, falling back to storage:', e);
                try {
                    this.contacts = JSON.parse(localStorage.getItem(`secureStepContacts_${userId}`) || '[]');
                } catch { this.contacts = []; }
            }
        }
        return this.contacts;
    }

    // ── GPS Geolocation ───────────────────────────────────────────────────────
    async getCurrentLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                const fallback = this.currentLocation || { latitude: 12.9716, longitude: 77.5946, accuracy: 0, timestamp: new Date().toISOString() };
                this.currentLocation = fallback;
                resolve(fallback);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                pos => {
                    this.currentLocation = {
                        latitude:  pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy:  pos.coords.accuracy || 10,
                        timestamp: new Date().toISOString()
                    };
                    resolve(this.currentLocation);
                },
                err => {
                    console.warn('Geolocation lookup issue, using best available location:', err.message);
                    const fallback = this.currentLocation || { latitude: 12.9716, longitude: 77.5946, accuracy: 0, timestamp: new Date().toISOString() };
                    this.currentLocation = fallback;
                    resolve(fallback);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });
    }

    googleMapsLink(lat, lng) {
        return `https://www.google.com/maps?q=${lat},${lng}`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  STEP 1: START SAFETY EVENT (DURATION SELECTION)
    // ═══════════════════════════════════════════════════════════════════════════
    triggerSOS() {
        if (this.isActive) {
            const el = document.getElementById('sos-countdown-overlay') || document.getElementById('sos-emergency-screen');
            if (el) {
                el.scrollIntoView?.({ behavior: 'smooth' });
                return;
            }
        }
        this.showDurationModal();
    }

    showDurationModal() {
        this._removeOverlay('sos-duration-modal');
        const overlay = document.createElement('div');
        overlay.id = 'sos-duration-modal';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 10000;
            background: rgba(15, 23, 42, 0.88);
            display: flex; align-items: center; justify-content: center;
            padding: 16px; backdrop-filter: blur(4px);`;
        overlay.innerHTML = `
          <div style="background: #ffffff; border-radius: 20px; padding: 32px 28px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.35); animation: popIn 0.2s ease-out;">
            <div style="width: 68px; height: 68px; border-radius: 50%; background: #fef2f2; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
              <i class="fas fa-shield-halved" style="font-size: 32px; color: #ef4444;"></i>
            </div>
            <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Start Safety Event</h2>
            <p style="font-size: 14px; color: #64748b; margin: 0 0 20px; line-height: 1.5;">
              Set your safety event duration. When time ends, you will confirm you are safe. If you don't respond, emergency mode triggers automatically.
            </p>

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 16px;">
              <button type="button" class="dur-btn" data-dur="5" style="padding: 12px; border: 2px solid #e2e8f0; border-radius: 12px; background: #f8fafc; font-size: 14px; font-weight: 700; color: #1e3a5f; cursor: pointer;">5 Minutes</button>
              <button type="button" class="dur-btn active" data-dur="15" style="padding: 12px; border: 2px solid #ef4444; border-radius: 12px; background: #fef2f2; font-size: 14px; font-weight: 700; color: #ef4444; cursor: pointer;">15 Minutes</button>
              <button type="button" class="dur-btn" data-dur="30" style="padding: 12px; border: 2px solid #e2e8f0; border-radius: 12px; background: #f8fafc; font-size: 14px; font-weight: 700; color: #1e3a5f; cursor: pointer;">30 Minutes</button>
              <button type="button" class="dur-btn" data-dur="60" style="padding: 12px; border: 2px solid #e2e8f0; border-radius: 12px; background: #f8fafc; font-size: 14px; font-weight: 700; color: #1e3a5f; cursor: pointer;">1 Hour</button>
            </div>

            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 16px;">
              <input type="number" id="customDurInput" min="1" max="480" placeholder="Custom duration (minutes)"
                style="flex: 1; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 14px; text-align: center;">
            </div>

            <!-- Quick Demo test button -->
            <div style="margin-bottom: 20px; text-align: right;">
              <button type="button" id="quickTestDurBtn" style="background: none; border: none; color: #0284c7; font-size: 12px; font-weight: 700; cursor: pointer; text-decoration: underline;">
                ⚡ Quick Demo: 10 seconds timer
              </button>
            </div>

            <div style="display: flex; gap: 10px;">
              <button type="button" id="cancelDurBtn"
                style="flex: 1; padding: 12px; border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; font-size: 14px; font-weight: 700; color: #64748b; cursor: pointer;">
                Cancel
              </button>
              <button type="button" id="startDurBtn"
                style="flex: 1.3; padding: 12px; border: none; border-radius: 12px; background: #ef4444; font-size: 14px; font-weight: 800; color: #ffffff; cursor: pointer; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);">
                Start Timer
              </button>
            </div>
          </div>
          <style>@keyframes popIn { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }</style>`;
        document.body.appendChild(overlay);

        let selectedMinutes = 15;

        overlay.querySelectorAll('.dur-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                overlay.querySelectorAll('.dur-btn').forEach(b => {
                    b.style.borderColor = '#e2e8f0';
                    b.style.background  = '#f8fafc';
                    b.style.color       = '#1e3a5f';
                });
                btn.style.borderColor = '#ef4444';
                btn.style.background  = '#fef2f2';
                btn.style.color       = '#ef4444';
                selectedMinutes = parseInt(btn.dataset.dur, 10);
                document.getElementById('customDurInput').value = '';
            });
        });

        document.getElementById('cancelDurBtn').addEventListener('click', () => overlay.remove());

        document.getElementById('quickTestDurBtn').addEventListener('click', () => {
            overlay.remove();
            this._startDurationCountdown(10, true);
        });

        document.getElementById('startDurBtn').addEventListener('click', () => {
            const customVal = parseInt(document.getElementById('customDurInput').value, 10);
            const durationMin = customVal > 0 ? customVal : selectedMinutes;
            overlay.remove();
            this._startDurationCountdown(durationMin, false);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  STEP 2: COUNTDOWN TIMER RUNS
    // ═══════════════════════════════════════════════════════════════════════════
    _startDurationCountdown(duration, isSecondsMode = false) {
        this.isActive = true;
        let totalSeconds = isSecondsMode ? duration : duration * 60;
        let remainingSeconds = totalSeconds;

        this._removeOverlay('sos-countdown-overlay');
        const overlay = document.createElement('div');
        overlay.id = 'sos-countdown-overlay';
        overlay.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 9999;
            background: #0f172a; color: #ffffff; border-radius: 16px; padding: 18px 22px;
            min-width: 240px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1);`;
        overlay.innerHTML = this._countdownHTML(remainingSeconds, totalSeconds);
        document.body.appendChild(overlay);

        if (this.durationTimer) clearInterval(this.durationTimer);

        this.durationTimer = setInterval(() => {
            remainingSeconds--;
            const el = document.getElementById('sos-countdown-overlay');
            if (el) el.innerHTML = this._countdownHTML(remainingSeconds, totalSeconds);

            if (remainingSeconds <= 0) {
                clearInterval(this.durationTimer);
                this.durationTimer = null;
                this._removeOverlay('sos-countdown-overlay');
                this._showAreYouSafeModal();
            }
        }, 1000);
    }

    _countdownHTML(remaining, total) {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        const pct = Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
            <div>
              <div style="font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;">Safety Event Active</div>
              <div style="font-size: 26px; font-weight: 900; color: #38bdf8; margin: 2px 0;">
                ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}
              </div>
              <div style="font-size: 11px; color: #94a3b8;">remaining until safety check</div>
            </div>
            <button onclick="window.emergencySOS._cancelTimer()"
              style="padding: 8px 12px; border: 1px solid #334155; border-radius: 8px; background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 12px; font-weight: 600; cursor: pointer;">
              Cancel
            </button>
          </div>
          <div style="margin-top: 10px; height: 5px; background: #1e293b; border-radius: 999px; overflow: hidden;">
            <div style="width: ${pct}%; height: 100%; background: #38bdf8; border-radius: 999px; transition: width 1s linear;"></div>
          </div>`;
    }

    _cancelTimer() {
        if (this.durationTimer) {
            clearInterval(this.durationTimer);
            this.durationTimer = null;
        }
        this.isActive = false;
        this._removeOverlay('sos-countdown-overlay');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  STEP 3: "Are you safe?" CONFIRMATION MODAL
    // ═══════════════════════════════════════════════════════════════════════════
    _showAreYouSafeModal() {
        this._removeOverlay('sos-safe-check');
        const overlay = document.createElement('div');
        overlay.id = 'sos-safe-check';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 10001;
            background: rgba(15, 23, 42, 0.92);
            display: flex; align-items: center; justify-content: center;
            padding: 16px; backdrop-filter: blur(6px);`;

        let countdown = 60; // 60-second timeout

        const renderContent = () => `
          <div style="background: #ffffff; border-radius: 24px; padding: 36px 28px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.4); animation: pulseSafeModal 0.25s ease-out;">
            <div style="width: 76px; height: 76px; border-radius: 50%; background: #fef2f2; margin: 0 auto 18px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 8px rgba(239,68,68,0.12);">
              <i class="fas fa-circle-question" style="font-size: 38px; color: #ef4444;"></i>
            </div>
            <h2 style="font-size: 26px; font-weight: 900; color: #0f172a; margin: 0 0 8px;">Are you safe?</h2>
            <p style="font-size: 15px; color: #64748b; margin: 0 0 24px; line-height: 1.5;">
              Your safety event timer ended. Please confirm your safety status immediately.
            </p>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 22px;">
              <button id="sosYesBtn"
                style="padding: 18px 14px; border: none; border-radius: 14px; background: #10b981; color: #ffffff; font-size: 18px; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 6px 18px rgba(16,185,129,0.35); transition: transform 0.15s;">
                <i class="fas fa-check"></i> YES
              </button>
              <button id="sosNoBtn"
                style="padding: 18px 14px; border: none; border-radius: 14px; background: #ef4444; color: #ffffff; font-size: 18px; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 6px 18px rgba(239,68,68,0.35); transition: transform 0.15s;">
                <i class="fas fa-triangle-exclamation"></i> NO
              </button>
            </div>

            <div id="sosAutoTimeoutText" style="font-size: 13px; color: #94a3b8; font-weight: 600;">
              Emergency mode will activate in <strong style="color: #ef4444; font-size: 15px;">${countdown}s</strong> if no response
            </div>
          </div>
          <style>
            @keyframes pulseSafeModal { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          </style>`;

        overlay.innerHTML = renderContent();
        document.body.appendChild(overlay);

        const timeoutInterval = setInterval(() => {
            countdown--;
            const timeoutEl = document.getElementById('sosAutoTimeoutText');
            if (timeoutEl) {
                timeoutEl.innerHTML = `Emergency mode will activate in <strong style="color: #ef4444; font-size: 15px;">${countdown}s</strong> if no response`;
            }
            if (countdown <= 0) {
                clearInterval(timeoutInterval);
                overlay.remove();
                this._triggerEmergencyMode('timeout');
            }
        }, 1000);

        // YES -> Safe: close and do nothing
        document.getElementById('sosYesBtn').addEventListener('click', () => {
            clearInterval(timeoutInterval);
            overlay.remove();
            this.isActive = false;
            this._showSafeConfirmation();
        });

        // NO -> Danger: trigger emergency mode immediately
        document.getElementById('sosNoBtn').addEventListener('click', () => {
            clearInterval(timeoutInterval);
            overlay.remove();
            this._triggerEmergencyMode('user_reported_danger');
        });
    }

    _showSafeConfirmation() {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 10002;
            background: #10b981; color: #ffffff; padding: 14px 24px; border-radius: 12px;
            font-size: 15px; font-weight: 700; box-shadow: 0 8px 24px rgba(0,0,0,0.25);
            display: flex; align-items: center; gap: 10px;`;
        toast.innerHTML = '<i class="fas fa-circle-check" style="font-size: 18px;"></i> Glad you are safe! Safety event concluded.';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  STEP 4: EMERGENCY MODE WITH LIVE LOCATION TRACKING
    // ═══════════════════════════════════════════════════════════════════════════
    async _triggerEmergencyMode(triggerReason = 'manual') {
        this.isActive = true;

        const spinner = this._showSpinner('Acquiring GPS coordinates and preparing emergency mode…');

        await this.initializeContacts();

        let loc = null;
        try {
            loc = await this.getCurrentLocation();
        } catch (err) {
            loc = this.currentLocation || { latitude: 12.9716, longitude: 77.5946, accuracy: 0, timestamp: new Date().toISOString() };
        }
        spinner.remove();

        const userId = this.getCurrentUserId();
        const userName = this.getCurrentUserName();

        try {
            const res = await fetch('/api/sos/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    userName: userName,
                    latitude: loc.latitude,
                    longitude: loc.longitude
                })
            });
            const data = await res.json();
            if (data.success && data.sosId) {
                this.sosId = data.sosId;
                this.sosToken = data.token;
                this.shareUrl = data.shareUrl;
            }
        } catch (err) {
            console.warn('Backend SOS creation notice (local tracking active):', err);
        }

        this._startLocationTracking();
        this._showEmergencyScreen(loc, triggerReason);
    }

    _startLocationTracking() {
        if (this.locationTrackingInterval) clearInterval(this.locationTrackingInterval);
        if (this.watchPositionId && navigator.geolocation) {
            navigator.geolocation.clearWatch(this.watchPositionId);
        }

        if (navigator.geolocation) {
            this.watchPositionId = navigator.geolocation.watchPosition(
                pos => {
                    this.currentLocation = {
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy: pos.coords.accuracy || 10,
                        timestamp: new Date().toISOString()
                    };
                    this._updateEmergencyLocationUI(this.currentLocation);
                },
                err => console.warn('watchPosition notice:', err.message),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
            );
        }

        // Periodic sync to backend every 10 seconds
        this.locationTrackingInterval = setInterval(async () => {
            if (!this.isActive) return;
            try {
                await this.getCurrentLocation();
                if (this.currentLocation) {
                    this._updateEmergencyLocationUI(this.currentLocation);
                    if (this.sosId) {
                        await fetch('/api/sos/location', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sosId: this.sosId,
                                token: this.sosToken,
                                latitude: this.currentLocation.latitude,
                                longitude: this.currentLocation.longitude
                            })
                        }).catch(() => {});
                    }
                }
            } catch (e) { console.warn('Location sync interval notice:', e); }
        }, 10000);
    }

    _updateEmergencyLocationUI(loc) {
        const coordsEl = document.getElementById('sosLiveCoords');
        const mapsBtn  = document.getElementById('sosOpenMapsBtn');
        const timeEl   = document.getElementById('sosLiveTime');
        const mapsLink = this.googleMapsLink(loc.latitude, loc.longitude);

        if (coordsEl) coordsEl.textContent = `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;
        if (mapsBtn) mapsBtn.href = mapsLink;
        if (timeEl) timeEl.textContent = `Updated: ${new Date().toLocaleTimeString()}`;

        if (this.activeSosMap && window.google && window.google.maps) {
            const pos = { lat: Number(loc.latitude), lng: Number(loc.longitude) };
            this.activeSosMap.panTo(pos);
            if (this.activeSosMarker) this.activeSosMarker.setPosition(pos);
        }
    }

    async stopSOS() {
        if (this.sosId) {
            try {
                await fetch('/api/sos/resolve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sosId: this.sosId, token: this.sosToken })
                });
            } catch (e) { console.warn('Backend SOS stop notice:', e); }
        }

        if (this.watchPositionId && navigator.geolocation) {
            navigator.geolocation.clearWatch(this.watchPositionId);
            this.watchPositionId = null;
        }

        if (this.locationTrackingInterval) {
            clearInterval(this.locationTrackingInterval);
            this.locationTrackingInterval = null;
        }

        this.sosId    = null;
        this.sosToken = null;
        this.isActive = false;
    }

    // ── Emergency Active Screen Overlay ───────────────────────────────────────
    _showEmergencyScreen(loc, reason) {
        this._removeOverlay('sos-emergency-screen');

        const mapsLink = this.googleMapsLink(loc.latitude, loc.longitude);
        const coords   = `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;
        const userContacts = this.contacts;
        const userName = this.getCurrentUserName();
        const shareLink = this.shareUrl ? `${window.location.origin}${this.shareUrl}` : `${window.location.origin}/emergency-live.html?sosId=${this.sosId}&token=${this.sosToken}`;

        const contactsHTML = userContacts.length > 0
            ? userContacts.map(c => `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; background: rgba(255, 255, 255, 0.12); border-radius: 12px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.1);">
                  <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                    <div style="width: 38px; height: 38px; border-radius: 50%; background: rgba(255, 255, 255, 0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                      <i class="fas ${c.relationship === 'Emergency Service' ? 'fa-user-shield' : 'fa-user'}" style="font-size: 16px;"></i>
                    </div>
                    <div style="min-width: 0;">
                      <div style="font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</div>
                      <div style="font-size: 12px; opacity: 0.85;">${c.phone} ${c.relationship ? '· ' + c.relationship : ''}</div>
                    </div>
                  </div>
                  <div style="display: flex; gap: 6px; flex-shrink: 0;">
                    <a href="tel:${c.phone}"
                       style="padding: 6px 12px; background: #ffffff; border-radius: 8px; color: #b91c1c; font-size: 13px; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                      <i class="fas fa-phone"></i> Call
                    </a>
                    <a href="sms:${c.phone}?body=EMERGENCY! I need immediate help. Live tracking: ${encodeURIComponent(shareLink)}"
                       style="padding: 6px 10px; background: rgba(255,255,255,0.2); border-radius: 8px; color: #ffffff; font-size: 13px; font-weight: 700; text-decoration: none;">
                      SMS
                    </a>
                  </div>
                </div>`).join('')
            : `<div style="padding: 16px; background: rgba(255, 255, 255, 0.1); border-radius: 12px; font-size: 14px; text-align: center; opacity: 0.9;">
                 No personal emergency contacts saved yet.
                 <div style="margin-top: 6px;">
                   <a href="emergency-contacts.html" style="color: #ffffff; font-weight: 700; text-decoration: underline;">Add your trusted contacts →</a>
                 </div>
               </div>`;

        const overlay = document.createElement('div');
        overlay.id = 'sos-emergency-screen';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 10002;
            background: linear-gradient(160deg, #b91c1c 0%, #7f1d1d 100%);
            color: #ffffff; overflow-y: auto; padding: 24px 16px;`;
        overlay.innerHTML = `
          <div style="max-width: 600px; margin: 0 auto; padding-bottom: 30px;">
            <!-- Header with pulse -->
            <div style="text-align: center; margin-bottom: 20px;">
              <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(255, 255, 255, 0.15); margin: 0 auto 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 12px rgba(255,255,255,0.1); animation: sosPulse 1.4s infinite;">
                <i class="fas fa-triangle-exclamation" style="font-size: 38px; color: #ffffff;"></i>
              </div>
              <h1 style="font-size: 26px; font-weight: 900; margin: 0 0 6px; letter-spacing: 0.02em;">EMERGENCY ACTIVE</h1>
              <div style="font-size: 14px; opacity: 0.9; font-weight: 600;">
                User: <strong>${userName}</strong> · <span id="sosLiveTime">Started: ${new Date().toLocaleTimeString()}</span>
              </div>
            </div>

            <!-- Embedded Live Map -->
            <div style="background: rgba(255, 255, 255, 0.12); border-radius: 16px; overflow: hidden; margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.15);">
              <div style="padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.15);">
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;">
                  📍 Live GPS Location
                </div>
                <span style="font-size: 11px; background: rgba(255,255,255,0.25); padding: 3px 8px; border-radius: 999px; font-weight: 700;">Live Tracking</span>
              </div>
              <div id="sosActiveInlineMap" style="width: 100%; height: 200px; background: #e2e8f0;"></div>
              <div style="padding: 14px 16px;">
                <div id="sosLiveCoords" style="font-size: 15px; font-weight: 800; margin-bottom: 10px; font-family: monospace;">
                  ${coords}
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <a id="sosOpenMapsBtn" href="${mapsLink}" target="_blank" rel="noopener"
                     style="flex: 1; min-width: 140px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 14px; background: #ffffff; border-radius: 10px; color: #b91c1c; font-weight: 800; text-decoration: none; font-size: 13px;">
                    <i class="fas fa-map-location-dot"></i> Google Maps
                  </a>
                  <button onclick="window.emergencySOS._copyLiveShareLink('${shareLink}')"
                     style="flex: 1; min-width: 140px; padding: 10px 14px; background: rgba(255,255,255,0.2); border: none; border-radius: 10px; color: #ffffff; font-weight: 700; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                    <i class="fas fa-share-nodes"></i> Share Live Link
                  </button>
                </div>
              </div>
            </div>

            <!-- Emergency Contacts List (User's Saved Contacts) -->
            <div style="background: rgba(255, 255, 255, 0.12); border-radius: 16px; padding: 18px; margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.15);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.85;">
                  👤 Your Emergency Contacts
                </div>
                <span style="font-size: 12px; opacity: 0.8;">${userContacts.length} saved</span>
              </div>
              ${contactsHTML}
            </div>

            <!-- National Emergency Helplines -->
            <div style="background: rgba(255, 255, 255, 0.12); border-radius: 16px; padding: 16px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.15);">
              <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.85; margin-bottom: 10px;">
                🚨 Quick Helplines
              </div>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                <a href="tel:100"
                   style="padding: 10px 6px; background: rgba(255,255,255,0.18); border-radius: 10px; color: #ffffff; font-weight: 800; text-align: center; text-decoration: none; font-size: 13px;">
                  <i class="fas fa-user-shield"></i> Police 100
                </a>
                <a href="tel:108"
                   style="padding: 10px 6px; background: rgba(255,255,255,0.18); border-radius: 10px; color: #ffffff; font-weight: 800; text-align: center; text-decoration: none; font-size: 13px;">
                  <i class="fas fa-truck-medical"></i> Amb 108
                </a>
                <a href="tel:1091"
                   style="padding: 10px 6px; background: rgba(255,255,255,0.18); border-radius: 10px; color: #ffffff; font-weight: 800; text-align: center; text-decoration: none; font-size: 13px;">
                  <i class="fas fa-hand-holding-heart"></i> Women 1091
                </a>
              </div>
            </div>

            <!-- Stop / Resolve Emergency Button -->
            <button onclick="window.emergencySOS._dismissEmergency()"
              style="width: 100%; padding: 16px; border: 2px solid rgba(255,255,255,0.4); border-radius: 14px; background: rgba(0,0,0,0.25); color: #ffffff; font-size: 16px; font-weight: 800; cursor: pointer; transition: background 0.2s;">
              ✓ I am Safe Now — Stop Emergency Mode
            </button>
          </div>
          <style>
            @keyframes sosPulse {
              0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.4); }
              70% { transform: scale(1.05); box-shadow: 0 0 0 16px rgba(255,255,255,0); }
              100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0); }
            }
          </style>`;
        document.body.appendChild(overlay);

        // Render mini Google Map in overlay
        if (window.google && window.google.maps) {
            const mapDiv = document.getElementById('sosActiveInlineMap');
            if (mapDiv) {
                const center = { lat: Number(loc.latitude), lng: Number(loc.longitude) };
                this.activeSosMap = new google.maps.Map(mapDiv, {
                    center,
                    zoom: 15,
                    mapTypeControl: false,
                    streetViewControl: false,
                    styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }]
                });
                this.activeSosMarker = new google.maps.Marker({
                    position: center,
                    map: this.activeSosMap,
                    title: 'Current Position',
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 10,
                        fillColor: '#ef4444',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2
                    }
                });
            }
        } else if (window.loadGoogleMapsApi) {
            window.loadGoogleMapsApi().then(() => {
                const mapDiv = document.getElementById('sosActiveInlineMap');
                if (mapDiv) {
                    const center = { lat: Number(loc.latitude), lng: Number(loc.longitude) };
                    this.activeSosMap = new google.maps.Map(mapDiv, {
                        center,
                        zoom: 15,
                        mapTypeControl: false,
                        streetViewControl: false
                    });
                    this.activeSosMarker = new google.maps.Marker({
                        position: center,
                        map: this.activeSosMap,
                        title: 'Current Position'
                    });
                }
            }).catch(() => {});
        }
    }

    _copyLiveShareLink(link) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(link).then(() => {
                alert('Secure emergency live tracking link copied to clipboard!');
            }).catch(() => {
                prompt('Copy secure emergency live tracking link:', link);
            });
        } else {
            prompt('Copy secure emergency live tracking link:', link);
        }
    }

    async _dismissEmergency() {
        if (confirm('Are you safe? Confirm to end emergency mode and stop live location tracking.')) {
            await this.stopSOS();
            this._removeOverlay('sos-emergency-screen');
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 10003;
                background: #10b981; color: #ffffff; padding: 14px 24px; border-radius: 12px;
                font-size: 15px; font-weight: 700; box-shadow: 0 8px 24px rgba(0,0,0,0.25);`;
            toast.innerHTML = '<i class="fas fa-circle-check"></i> Emergency mode stopped. Stay safe!';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 4000);
        }
    }

    // ── Utilities ─────────────────────────────────────────────────────────────
    _removeOverlay(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    _showSpinner(msg) {
        const el = document.createElement('div');
        el.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 10001;
            background: #0f172a; color: #ffffff; padding: 14px 20px; border-radius: 12px;
            font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 10px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);`;
        el.innerHTML = `<i class="fas fa-spinner fa-spin" style="color: #38bdf8;"></i> ${msg}`;
        document.body.appendChild(el);
        return el;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  SCHEDULED SAFETY CHECKS
    // ═══════════════════════════════════════════════════════════════════════════
    startSafetyCheckSchedule() {
        const startInput    = document.getElementById('eventStartTime');
        const exitInput     = document.getElementById('eventExitTime');
        const intervalInput = document.getElementById('safetyCheckInterval');

        if (!startInput || !exitInput) return;

        const startTime       = startInput.value;
        const exitTime        = exitInput.value;
        const intervalMinutes = parseInt(intervalInput ? intervalInput.value : '15', 10);

        if (!startTime || !exitTime) {
            alert('Please select both Event Start Time and Expected Exit Time.');
            return;
        }

        const startDate = new Date(startTime);
        const exitDate  = new Date(exitTime);
        const now       = new Date();

        if (exitDate <= startDate) {
            alert('Expected Exit Time must be after Event Start Time.');
            return;
        }

        this.safetyCheckSchedule = { startTime, exitTime, intervalMinutes, isActive: true };
        localStorage.setItem('safetyCheckSchedule', JSON.stringify(this.safetyCheckSchedule));

        const statusDiv = document.getElementById('safetyCheckStatus');
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.innerHTML = `<i class="fas fa-clock"></i> Safety check schedule active (checks every ${intervalMinutes} min)`;
        }

        const delayToStart = Math.max(0, startDate - now);
        if (this.safetyCheckTimer) clearTimeout(this.safetyCheckTimer);

        this.safetyCheckTimer = setTimeout(() => {
            this._runPeriodicSafetyChecks(intervalMinutes);
        }, delayToStart);
        this.isSafetyCheckActive = true;
    }

    _runPeriodicSafetyChecks(intervalMinutes) {
        const statusDiv = document.getElementById('safetyCheckStatus');
        if (statusDiv) {
            statusDiv.innerHTML = `<i class="fas fa-circle-check"></i> Safety checks active — checking every ${intervalMinutes} min`;
        }
        this._performSafetyCheck();
        if (this.safetyCheckInterval) clearInterval(this.safetyCheckInterval);
        this.safetyCheckInterval = setInterval(() => this._performSafetyCheck(), intervalMinutes * 60 * 1000);
    }

    _performSafetyCheck() {
        if (!this.safetyCheckSchedule) return;
        if (new Date() >= new Date(this.safetyCheckSchedule.exitTime)) {
            this.stopSafetyCheckSchedule();
            return;
        }
        this._showAreYouSafeModal();
    }

    stopSafetyCheckSchedule() {
        if (this.safetyCheckInterval) {
            clearInterval(this.safetyCheckInterval);
            this.safetyCheckInterval = null;
        }
        if (this.safetyCheckTimer) {
            clearTimeout(this.safetyCheckTimer);
            this.safetyCheckTimer = null;
        }
        this.isSafetyCheckActive = false;
        this.safetyCheckSchedule = null;
        localStorage.removeItem('safetyCheckSchedule');
        const statusDiv = document.getElementById('safetyCheckStatus');
        if (statusDiv) statusDiv.style.display = 'none';
    }

    loadSafetyCheckSchedule() {
        const saved = localStorage.getItem('safetyCheckSchedule');
        if (!saved) return;
        try {
            const schedule = JSON.parse(saved);
            if (new Date() < new Date(schedule.exitTime) && schedule.isActive) {
                this.safetyCheckSchedule = schedule;
                const statusDiv = document.getElementById('safetyCheckStatus');
                if (statusDiv) {
                    statusDiv.style.display = 'block';
                    statusDiv.innerHTML = `<i class="fas fa-circle-check"></i> Safety checks active — every ${schedule.intervalMinutes} min`;
                }
                this._runPeriodicSafetyChecks(schedule.intervalMinutes);
            } else {
                localStorage.removeItem('safetyCheckSchedule');
            }
        } catch { localStorage.removeItem('safetyCheckSchedule'); }
    }

    async sendEmergencyAlert() { await this._triggerEmergencyMode('direct_alert'); }
}

// ─── Initialize global instance ─────────────────────────────────────────────
window.emergencySOS = new EmergencySOS();

document.addEventListener('DOMContentLoaded', async () => {
    await window.emergencySOS.initializeContacts();

    document.querySelectorAll('[data-action="sos"]').forEach(btn => {
        btn.addEventListener('click', () => window.emergencySOS.triggerSOS());
    });

    window.emergencySOS.loadSafetyCheckSchedule();
});
