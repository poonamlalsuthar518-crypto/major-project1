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
            try {
                if (!window.emergencyContacts._loaded) {
                    await window.emergencyContacts.loadContacts();
                }
                const c = window.emergencyContacts.getAllContacts();
                if (Array.isArray(c) && c.length > 0) {
                    this.contacts = c;
                    return this.contacts;
                }
            } catch (err) {
                console.warn('Emergency contacts helper load notice:', err);
            }
        }

        const userId = this.getCurrentUserId();
        try {
            const res = await fetch(`/api/emergency-contacts/${userId}`);
            const data = await res.json();
            if (data.success && Array.isArray(data.contacts) && data.contacts.length > 0) {
                this.contacts = data.contacts.map(c => ({
                    id: c.id,
                    name: c.name,
                    phone: c.phone,
                    email: c.email || '',
                    relationship: c.relationship || 'Other',
                    priority: c.is_primary ? 'priority' : 'standard'
                }));
                return this.contacts;
            }
        } catch (e) {
            console.warn('Emergency contacts API fetch failed, falling back to storage:', e);
        }

        try {
            const stored = localStorage.getItem(`secureStepContacts_${userId}`) || localStorage.getItem('secureStepContacts_default_user') || localStorage.getItem('secureStepContacts_guest');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    this.contacts = parsed;
                    return this.contacts;
                }
            }
        } catch { }

        if (window.emergencyContacts && Array.isArray(window.emergencyContacts.getAllContacts())) {
            this.contacts = window.emergencyContacts.getAllContacts();
        } else {
            this.contacts = [];
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
            background: rgba(15, 23, 42, 0.94);
            display: flex; align-items: center; justify-content: center;
            padding: 16px; backdrop-filter: blur(8px);`;

        let countdown = 60; // 60-second timeout

        const renderContent = () => `
          <div style="background: #ffffff; border-radius: 24px; padding: 36px 28px; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.45); animation: pulseSafeModal 0.25s ease-out; border: 2px solid #ef4444;">
            <div style="width: 76px; height: 76px; border-radius: 50%; background: #fef2f2; margin: 0 auto 18px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 8px rgba(239,68,68,0.15);">
              <i class="fas fa-triangle-exclamation" style="font-size: 38px; color: #ef4444;"></i>
            </div>
            <h2 style="font-size: 26px; font-weight: 900; color: #0f172a; margin: 0 0 8px;">Are you safe?</h2>
            <p style="font-size: 14px; color: #64748b; margin: 0 0 16px; line-height: 1.5;">
              Your safety event timer ended. Please confirm your safety status immediately.
            </p>

            <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; padding: 10px 14px; margin-bottom: 20px; font-size: 13px; color: #9f1239; line-height: 1.4; text-align: left;">
              <i class="fas fa-shield-halved" style="color: #e11d48; margin-right: 4px;"></i>
              <strong>Notice:</strong> If you tap <strong>NOT SAFE</strong> or do not respond, emergency mode will activate with <strong>live GPS tracking</strong> and instant <strong>WhatsApp sharing options</strong>.
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px;">
              <button id="sosYesBtn"
                style="padding: 16px 12px; border: none; border-radius: 14px; background: #10b981; color: #ffffff; font-size: 16px; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 6px 18px rgba(16,185,129,0.35); transition: transform 0.15s;">
                <i class="fas fa-check"></i> I Am Safe (YES)
              </button>
              <button id="sosNoBtn"
                style="padding: 16px 12px; border: none; border-radius: 14px; background: #ef4444; color: #ffffff; font-size: 16px; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 6px 18px rgba(239,68,68,0.35); transition: transform 0.15s;">
                <i class="fas fa-triangle-exclamation"></i> I'm NOT SAFE (NO)
              </button>
            </div>

            <div id="sosAutoTimeoutText" style="font-size: 13px; color: #64748b; font-weight: 600;">
              Emergency mode &amp; WhatsApp share in <strong style="color: #ef4444; font-size: 16px;">${countdown}s</strong> if no response
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
                timeoutEl.innerHTML = `Emergency mode &amp; WhatsApp share in <strong style="color: #ef4444; font-size: 16px;">${countdown}s</strong> if no response`;
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
    //  STEP 4: EMERGENCY MODE WITH LIVE LOCATION TRACKING & SMS/WHATSAPP DISPATCH
    // ═══════════════════════════════════════════════════════════════════════════
    _formatPhoneForWhatsApp(phone) {
        if (!phone) return '';
        let cleaned = String(phone).replace(/[^\d]/g, '');
        if (cleaned.length === 10) {
            cleaned = '91' + cleaned;
        } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
            cleaned = '91' + cleaned.substring(1);
        } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
            cleaned = cleaned;
        }
        return cleaned;
    }

    _formatPhoneForSms(phone) {
        if (!phone) return '';
        let cleaned = String(phone).replace(/[^\d+]/g, '');
        if (!cleaned.startsWith('+') && cleaned.length === 10) {
            cleaned = '+91' + cleaned;
        }
        return cleaned;
    }

    _playEmergencyAlarm() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const now = ctx.currentTime;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.3, now);

            for (let i = 0; i < 6; i++) {
                osc.frequency.setValueAtTime(880, now + (i * 0.5));
                osc.frequency.setValueAtTime(587.33, now + (i * 0.5) + 0.25);
            }

            gain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 3.0);
        } catch (e) {
            console.warn('Audio siren alert notice:', e);
        }

        if (navigator.vibrate) {
            try { navigator.vibrate([400, 200, 400, 200, 800]); } catch (e) {}
        }
    }

    async _dispatchEmergencyNotifications(loc, triggerReason) {
        const userName = this.getCurrentUserName();
        const shareLink = this.shareUrl
            ? `${window.location.origin}${this.shareUrl}`
            : `${window.location.origin}/emergency-live.html?sosId=${this.sosId}&token=${this.sosToken}`;
        const mapsUrl = this.googleMapsLink(loc.latitude, loc.longitude);

        const reasonLabel = triggerReason === 'timeout'
            ? 'Safety Check Timed Out (User Did Not Respond)'
            : (triggerReason === 'user_reported_danger' ? 'User Confirmed NOT SAFE' : 'Emergency SOS Alert');

        const timestamp = new Date().toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'medium'
        });

        this.lastAlertMessage = 
`🚨 EMERGENCY SOS ALERT — SecureStep
${userName} is in an emergency and needs immediate help!

Status: ${reasonLabel}
⏰ Timestamp: ${timestamp}
📍 Live Tracking: ${shareLink}
🗺️ Google Maps: ${mapsUrl}
📌 Coordinates: ${Number(loc.latitude).toFixed(6)}, ${Number(loc.longitude).toFixed(6)}

Please check on them or send emergency assistance immediately!`;

        // Play audible alarm to alert the user locally
        this._playEmergencyAlarm();
    }

    async _triggerEmergencyMode(triggerReason = 'manual') {
        this.isActive = true;

        const spinner = this._showSpinner('Acquiring GPS coordinates & preparing emergency mode…');

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
                    longitude: loc.longitude,
                    triggerReason: triggerReason
                })
            });
            const data = await res.json();
            if (data.success && data.sosId) {
                this.sosId = data.sosId;
                this.sosToken = data.token;
                this.shareUrl = data.shareUrl;
                this.dispatchedNotifications = data.notifications || {};
            }
        } catch (err) {
            console.warn('Backend SOS creation notice (local tracking active):', err);
        }

        // Build the alert message and play alarm (notifications already dispatched by /api/sos/start)
        await this._dispatchEmergencyNotifications(loc, triggerReason);

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

        if (this.activeSosMap) {
            const lat = Number(loc.latitude);
            const lng = Number(loc.longitude);
            if (typeof this.activeSosMap.flyTo === 'function') {
                this.activeSosMap.flyTo({ center: [lng, lat], zoom: 15 });
            } else if (typeof this.activeSosMap.setCenter === 'function') {
                this.activeSosMap.setCenter([lng, lat]);
            }
            if (this.activeSosMarker && typeof this.activeSosMarker.setLngLat === 'function') {
                this.activeSosMarker.setLngLat([lng, lat]);
            }
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
        const userContacts = this.contacts || [];
        const userName = this.getCurrentUserName();
        const shareLink = this.shareUrl
            ? `${window.location.origin}${this.shareUrl}`
            : `${window.location.origin}/emergency-live.html?sosId=${this.sosId}&token=${this.sosToken}`;

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const reasonLabel = reason === 'timeout'
            ? 'Safety Check Timed Out (User Did Not Respond)'
            : (reason === 'user_reported_danger' ? 'User Confirmed NOT SAFE' : 'Emergency SOS Alert');
        const timestamp = new Date().toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'medium'
        });

        const emergencyAlertMessage = this.lastAlertMessage || 
`🚨 EMERGENCY SOS ALERT — SecureStep
${userName} is in an emergency and needs immediate help!

Status: ${reasonLabel}
⏰ Timestamp: ${timestamp}
📍 Live Tracking: ${shareLink}
🗺️ Google Maps: ${mapsLink}
📌 Location: ${coords}

Please check on them or send emergency assistance immediately!`;

        const validContacts = userContacts.filter(c => c && c.phone && String(c.phone).trim().length > 0);

        let whatsappShareSectionHTML = '';
        if (validContacts.length === 0) {
            const genericWaUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(emergencyAlertMessage)}`;
            whatsappShareSectionHTML = `
              <div style="background: rgba(0, 0, 0, 0.38); border: 2px solid #25D366; border-radius: 18px; padding: 18px 20px; margin-bottom: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.35);">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
                  <div style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="background: #25D366; color: #ffffff; font-size: 11px; font-weight: 900; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.04em; display: inline-flex; align-items: center; gap: 6px;">
                      <i class="fab fa-whatsapp" style="font-size: 15px;"></i> SHARE VIA WHATSAPP
                    </span>
                    <span style="font-size: 13px; font-weight: 700; color: #86efac;">Ready to send</span>
                  </div>
                  <span style="font-size: 11px; background: rgba(255,255,255,0.18); padding: 3px 8px; border-radius: 999px; font-weight: 600;">
                    <i class="fas fa-satellite-dish"></i> Live GPS Active
                  </span>
                </div>
                <p style="font-size: 13px; color: #e2e8f0; margin: 0 0 14px; line-height: 1.4;">
                  Tap below to open WhatsApp with your live GPS location and emergency alert pre-filled:
                </p>
                <a href="${genericWaUrl}" target="_blank" rel="noopener" class="sos-whatsapp-btn"
                   style="display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 14px; background: #25D366; color: #ffffff; border-radius: 12px; font-size: 16px; font-weight: 900; text-decoration: none; box-shadow: 0 4px 14px rgba(37,211,102,0.4); box-sizing: border-box;">
                  <i class="fab fa-whatsapp" style="font-size: 24px;"></i> Share via WhatsApp
                </a>
                <div style="font-size: 12px; color: #fde68a; margin-top: 10px; text-align: center;">
                  ⚠️ No personal emergency contacts saved yet.
                  <a href="emergency-contacts.html" style="color: #ffffff; font-weight: 700; text-decoration: underline; margin-left: 4px;">Add your trusted contacts &rarr;</a>
                </div>
              </div>`;
        } else {
            // Contacts are available: render individual buttons for each contact
            const contactButtonsHTML = validContacts.map(c => {
                const cWaPhone = this._formatPhoneForWhatsApp(c.phone);
                const cWaUrl = `https://wa.me/${cWaPhone}?text=${encodeURIComponent(emergencyAlertMessage)}`;
                const isPrimary = c.priority === 'priority';
                return `
                  <a href="${cWaUrl}" target="_blank" rel="noopener" class="sos-whatsapp-btn"
                     style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; background: #25D366; color: #ffffff; border-radius: 12px; font-size: 15px; font-weight: 800; text-decoration: none; box-shadow: 0 4px 14px rgba(37,211,102,0.35); box-sizing: border-box; transition: transform 0.15s, filter 0.15s;">
                    <span style="display: inline-flex; align-items: center; gap: 10px;">
                      <i class="fab fa-whatsapp" style="font-size: 22px;"></i>
                      <span>WhatsApp &rarr; <strong>${c.name}</strong></span>
                    </span>
                    <span style="font-size: 12px; font-weight: 600; opacity: 0.95; background: rgba(0,0,0,0.22); padding: 4px 10px; border-radius: 8px;">
                      ${c.phone}${c.relationship ? ' · ' + c.relationship : ''}${isPrimary ? ' ⭐ Priority' : ''}
                    </span>
                  </a>`;
            }).join('');

            const chooseAnyChatUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(emergencyAlertMessage)}`;

            whatsappShareSectionHTML = `
              <div style="background: rgba(0, 0, 0, 0.38); border: 2px solid #25D366; border-radius: 18px; padding: 18px 20px; margin-bottom: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.35);">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
                  <div style="display: inline-flex; align-items: center; gap: 8px;">
                    <span style="background: #25D366; color: #ffffff; font-size: 11px; font-weight: 900; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.04em; display: inline-flex; align-items: center; gap: 6px;">
                      <i class="fab fa-whatsapp" style="font-size: 15px;"></i> SHARE VIA WHATSAPP
                    </span>
                    <span style="font-size: 13px; font-weight: 700; color: #86efac;">Tap contact to send SOS</span>
                  </div>
                  <span style="font-size: 11px; background: rgba(255,255,255,0.18); padding: 3px 8px; border-radius: 999px; font-weight: 600;">
                    <i class="fas fa-satellite-dish"></i> Live GPS Active
                  </span>
                </div>

                <p style="font-size: 13px; color: #f1f5f9; margin: 0 0 12px; line-height: 1.4;">
                  Tap a contact below to open WhatsApp with your live tracking location and SOS alert pre-filled. Press <strong>Send</strong> inside WhatsApp:
                </p>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                  ${contactButtonsHTML}
                </div>

                <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.15); display: flex; justify-content: flex-end;">
                  <a href="${chooseAnyChatUrl}" target="_blank" rel="noopener"
                     style="font-size: 12px; color: #a7f3d0; text-decoration: underline; display: inline-flex; align-items: center; gap: 6px; font-weight: 600;">
                    <i class="fab fa-whatsapp"></i> Share via WhatsApp to another contact or group &rarr;
                  </a>
                </div>
              </div>`;
        }


        const contactsHTML = userContacts.length > 0
            ? userContacts.map(c => {
                const cWaPhone = this._formatPhoneForWhatsApp(c.phone);
                const cSmsPhone = this._formatPhoneForSms(c.phone);
                const cWaUrl = `https://wa.me/${cWaPhone}?text=${encodeURIComponent(emergencyAlertMessage)}`;
                const cSmsUrl = isIOS
                    ? `sms:${cSmsPhone}&body=${encodeURIComponent(emergencyAlertMessage)}`
                    : `sms:${cSmsPhone}?body=${encodeURIComponent(emergencyAlertMessage)}`;

                return `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; background: rgba(255, 255, 255, 0.12); border-radius: 12px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.12); flex-wrap: wrap;">
                  <div style="display: flex; align-items: center; gap: 12px; min-width: 170px;">
                    <div style="width: 38px; height: 38px; border-radius: 50%; background: rgba(255, 255, 255, 0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                      <i class="fas ${c.relationship === 'Emergency Service' ? 'fa-user-shield' : 'fa-user'}" style="font-size: 16px;"></i>
                    </div>
                    <div style="min-width: 0;">
                      <div style="font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${c.name} ${c.priority === 'priority' ? '<span style="font-size: 10px; background: #ef4444; color: #fff; padding: 2px 6px; border-radius: 4px; margin-left: 4px;">Primary</span>' : ''}
                      </div>
                      <div style="font-size: 12px; opacity: 0.85;">${c.phone} ${c.relationship ? '· ' + c.relationship : ''}</div>
                    </div>
                  </div>
                  <div style="display: flex; gap: 6px; flex-shrink: 0; margin-left: auto;">
                    <a href="tel:${c.phone}"
                       style="padding: 7px 11px; background: #ffffff; border-radius: 8px; color: #b91c1c; font-size: 12px; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                      <i class="fas fa-phone"></i> Call
                    </a>
                    <a href="${cSmsUrl}"
                       style="padding: 7px 11px; background: #0284c7; border-radius: 8px; color: #ffffff; font-size: 12px; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                      <i class="fas fa-comment-sms"></i> SMS
                    </a>
                    <a href="${cWaUrl}" target="_blank" rel="noopener"
                       style="padding: 7px 11px; background: #25D366; border-radius: 8px; color: #ffffff; font-size: 12px; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(37,211,102,0.3);">
                      <i class="fab fa-whatsapp" style="font-size: 15px;"></i> WhatsApp
                    </a>
                  </div>
                </div>`;
            }).join('')
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
            <div style="text-align: center; margin-bottom: 18px;">
              <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(255, 255, 255, 0.15); margin: 0 auto 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 12px rgba(255,255,255,0.1); animation: sosPulse 1.4s infinite;">
                <i class="fas fa-triangle-exclamation" style="font-size: 38px; color: #ffffff;"></i>
              </div>
              <h1 style="font-size: 26px; font-weight: 900; margin: 0 0 6px; letter-spacing: 0.02em;">EMERGENCY ACTIVE</h1>
              <div style="font-size: 14px; opacity: 0.95; font-weight: 600;">
                User: <strong>${userName}</strong> · <span id="sosLiveTime">Updated: ${new Date().toLocaleTimeString()}</span>
              </div>
            </div>

            <!-- PROMINENT WHATSAPP EMERGENCY SHARING SECTION -->
            ${whatsappShareSectionHTML}

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
                    <i class="fas fa-map-location-dot"></i> Open in Maps
                  </a>
                  <button onclick="window.emergencySOS._shareLiveLink('${shareLink}')"
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
            .sos-whatsapp-btn:hover {
              transform: translateY(-2px);
              filter: brightness(1.08);
            }
            @keyframes sosPulse {
              0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.4); }
              70% { transform: scale(1.05); box-shadow: 0 0 0 16px rgba(255,255,255,0); }
              100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0); }
            }
            @keyframes sosBannerGlow {
              0% { border-color: rgba(255,255,255,0.3); }
              100% { border-color: #ef4444; }
            }
          </style>`;
        document.body.appendChild(overlay);

        // Render mini MapLibre Map in overlay
        const renderSosMap = async () => {
            const mapDiv = document.getElementById('sosActiveInlineMap');
            if (!mapDiv) return;
            try {
                await window.loadMapLibreApi();
                const lat = Number(loc.latitude);
                const lng = Number(loc.longitude);
                this.activeSosMap = await window.SecureStepMap.createMap(mapDiv, [lng, lat], 15);

                this.activeSosMarker = window.SecureStepMap.createMarker(lat, lng, {
                    isUser: true,
                    popupHtml: '<strong>Emergency Location</strong>'
                });
                this.activeSosMarker.addTo(this.activeSosMap);
            } catch (err) {
                console.warn('Failed to render inline SOS map:', err);
            }
        };

        if (window.loadMapLibreApi) {
            renderSosMap();
        }
    }

    _shareLiveLink(link) {
        const userName = this.getCurrentUserName();
        const title = `🚨 Emergency Alert: ${userName} Needs Help`;
        const text = `I am NOT SAFE and need immediate help! Real-time live tracking: ${link}`;

        if (navigator.share) {
            navigator.share({ title, text, url: link }).catch(() => {
                this._copyLiveShareLink(link);
            });
        } else {
            this._copyLiveShareLink(link);
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
