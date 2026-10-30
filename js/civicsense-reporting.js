/*
 CivicSense Incident Reporting & My Reports Module for SecureStep
 Handles incident reporting, tracking history, real-time sync with backend database,
 and admin status review with remarks.
*/

class CivicSenseReporting {
    constructor() {
        this.incidentTypes = [
            { id: 'theft', name: 'Theft / Pickpocketing', icon: 'fa-hand-holding-dollar', severity: 'high' },
            { id: 'harassment', name: 'Harassment / Stalking', icon: 'fa-user-shield', severity: 'high' },
            { id: 'assault', name: 'Physical Assault', icon: 'fa-fist-raised', severity: 'critical' },
            { id: 'poor_lighting', name: 'Poor Street Lighting', icon: 'fa-lightbulb', severity: 'medium' },
            { id: 'broken_road', name: 'Broken Road / Potholes', icon: 'fa-road', severity: 'medium' },
            { id: 'suspicious_activity', name: 'Suspicious Activity', icon: 'fa-eye', severity: 'high' },
            { id: 'accident', name: 'Traffic Accident', icon: 'fa-car-crash', severity: 'critical' },
            { id: 'vandalism', name: 'Vandalism / Public Damage', icon: 'fa-spray-can', severity: 'low' },
            { id: 'other', name: 'Other Safety Hazard', icon: 'fa-exclamation-circle', severity: 'medium' }
        ];

        this.recentReports = [];
        this.myReports = [];
        this.currentReportLocation = null;
        this.loadLocalReports();
        this.showReportingModal = this.showReportingModal.bind(this);
        this.submitIncident = this.submitIncident.bind(this);
        this.useCurrentLocation = this.useCurrentLocation.bind(this);
        this.fetchMyReports = this.fetchMyReports.bind(this);
        this.fetchAllReports = this.fetchAllReports.bind(this);
        this.getRecentReports = this.getRecentReports.bind(this);
        this.formatReportForDisplay = this.formatReportForDisplay.bind(this);
        this.fetchRecentPublicReports = this.fetchRecentPublicReports.bind(this);
    }

    loadLocalReports() {
        try {
            const stored = localStorage.getItem('civicSenseReports');
            if (stored) this.recentReports = JSON.parse(stored);
            const myStored = localStorage.getItem('myCivicSenseReports');
            if (myStored) this.myReports = JSON.parse(myStored);
        } catch (e) {
            console.warn('Failed to parse local stored reports', e);
        }
    }

    saveReports() {
        try {
            localStorage.setItem('civicSenseReports', JSON.stringify(this.recentReports));
            localStorage.setItem('myCivicSenseReports', JSON.stringify(this.myReports));
        } catch (e) {
            console.warn('Failed to save reports locally', e);
        }
    }

    getLoggedInUser() {
        let user = null;
        try {
            user = JSON.parse(localStorage.getItem('secureStepUser') || 'null');
        } catch (e) {}

        if (!user) {
            try {
                user = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
            } catch (e) {}
        }

        const email = localStorage.getItem('secureStepUserEmail') || (user && user.email) || 'alex@example.com';
        const name = localStorage.getItem('secureStepUserName') || (user && user.fullName) || 'Alex Johnson';
        const id = (user && user.id) || 1;

        return { id, email, fullName: name };
    }

    async getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                (error) => {
                    // Fallback to central Bangalore coordinates if GPS denied or unavailable
                    resolve({
                        latitude: 12.9716,
                        longitude: 77.5946,
                        accuracy: 100,
                        fallback: true
                    });
                },
                { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
            );
        });
    }

    async submitIncident(reportData) {
        try {
            const user = this.getLoggedInUser();

            if (!reportData.location) {
                reportData.location = await this.getCurrentLocation();
            }

            const payload = {
                userId: user.id,
                userEmail: user.email,
                userName: user.fullName,
                incidentType: reportData.type,
                description: reportData.description,
                latitude: reportData.location ? reportData.location.latitude : null,
                longitude: reportData.location ? reportData.location.longitude : null,
                address: reportData.address || 'Location captured via GPS',
                isAnonymous: reportData.anonymous === true,
                severity: reportData.severity || this.getSeverityForType(reportData.type),
                imageUrl: reportData.imageUrl || null
            };

            // Call Backend API
            const response = await fetch('/api/civicsense/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            let savedReport = null;
            if (response.ok && data.success && data.report) {
                savedReport = data.report;
            } else {
                // Local fallback generation if server is offline
                savedReport = {
                    id: Date.now(),
                    reportId: 'INC-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000),
                    userId: user.id,
                    userEmail: user.email,
                    userName: user.fullName,
                    incidentType: payload.incidentType,
                    description: payload.description,
                    latitude: payload.latitude,
                    longitude: payload.longitude,
                    address: payload.address,
                    isAnonymous: payload.isAnonymous,
                    severity: payload.severity,
                    status: 'Submitted',
                    adminRemarks: '',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
            }

            // Update my reports and community cache
            this.myReports.unshift(savedReport);
            this.recentReports.unshift(savedReport);
            if (this.recentReports.length > 50) this.recentReports.pop();
            this.saveReports();

            // Notify UI
            window.dispatchEvent(new CustomEvent('incidentReported', { detail: savedReport }));

            return { success: true, report: savedReport };
        } catch (error) {
            console.error('Failed to submit incident:', error);
            return { success: false, error: error.message };
        }
    }

    async fetchMyReports() {
        const user = this.getLoggedInUser();
        try {
            const url = `/api/civicsense/my-reports?userId=${encodeURIComponent(user.id || '')}&email=${encodeURIComponent(user.email || '')}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.reports)) {
                    this.myReports = data.reports;
                    this.saveReports();
                    return this.myReports;
                }
            }
        } catch (e) {
            console.warn('Backend fetch for My Reports failed, using local storage cache:', e);
        }
        return this.myReports;
    }

    async fetchAllReports(filters = {}) {
        try {
            const params = new URLSearchParams(filters);
            const res = await fetch(`/api/civicsense/reports?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.reports)) {
                    this.recentReports = data.reports;
                    this.saveReports();
                    return this.recentReports;
                }
            }
        } catch (e) {
            console.warn('Backend fetch for all reports failed:', e);
        }
        return this.recentReports;
    }

    async updateReportStatus(reportId, status, adminRemarks) {
        try {
            const res = await fetch(`/api/civicsense/reports/${encodeURIComponent(reportId)}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, adminRemarks })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                // Update local caches
                const updated = data.report;
                const updateItem = (item) => {
                    if (String(item.id) === String(reportId) || String(item.reportId) === String(reportId)) {
                        return { ...item, ...updated };
                    }
                    return item;
                };
                this.myReports = this.myReports.map(updateItem);
                this.recentReports = this.recentReports.map(updateItem);
                this.saveReports();
                window.dispatchEvent(new CustomEvent('incidentStatusUpdated', { detail: updated }));
                return { success: true, report: updated };
            }
            return { success: false, message: data.message || 'Failed to update report' };
        } catch (e) {
            console.error('Update report status error:', e);
            return { success: false, message: e.message };
        }
    }

    getSeverityForType(typeId) {
        const type = this.incidentTypes.find(t => t.id === typeId);
        return type ? type.severity : 'medium';
    }

    
    async fetchRecentPublicReports(limit = 10) {
        try {
            const res = await fetch(`/api/civicsense/reports?limit=${limit}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.reports) && data.reports.length > 0) {
                    this.recentReports = data.reports;
                    this.saveReports();
                    return this.recentReports;
                }
            }
        } catch (e) {
            console.warn('Failed to fetch public reports from server:', e);
        }
        return this.recentReports;
    }
    getRecentReports(limit = 10) {
        return this.recentReports.slice(0, limit);
    }

    formatReportForDisplay(report) {
        const typeMeta = this.getTypeMeta(report.incidentType || report.type);
        const timeAgo = this.getTimeAgo(report.createdAt || report.timestamp);
        return {
            ...report,
            typeName: typeMeta.name,
            typeIcon: typeMeta.icon,
            timeAgo: timeAgo,
            severityColor: this.getSeverityColor(report.severity)
        };
    }

    getTimeAgo(timestamp) {
        if (!timestamp) return 'Just now';
        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} mins ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        return `${diffDays} days ago`;
    }

    getSeverityColor(severity) {
        const sev = String(severity || 'medium').toLowerCase();
        const colors = {
            critical: '#ef4444',
            high: '#f59e0b',
            medium: '#3b82f6',
            low: '#10b981'
        };
        return colors[sev] || '#64748b';
    }

    getReportsNearLocation(latitude, longitude, radiusKm = 5) {
        return this.recentReports.filter(report => {
            if (!report.latitude || !report.longitude) return false;
            const distance = this.calculateDistance(
                latitude, longitude,
                Number(report.latitude), Number(report.longitude)
            );
            return distance <= radiusKm;
        });
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    getStatistics(timeRange = 24) {
        const cutoff = new Date(Date.now() - timeRange * 60 * 60 * 1000);
        const recent = this.recentReports.filter(r => new Date(r.createdAt || r.timestamp) > cutoff);
        const stats = {
            total: recent.length,
            byType: {},
            bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
            byStatus: { Submitted: 0, Pending: 0, 'Under Review': 0, Resolved: 0, Rejected: 0 }
        };
        recent.forEach(r => {
            const t = r.incidentType || r.type || 'other';
            stats.byType[t] = (stats.byType[t] || 0) + 1;
            const s = String(r.severity || 'medium').toLowerCase();
            if (stats.bySeverity[s] !== undefined) stats.bySeverity[s]++;
            const st = r.status || 'Submitted';
            stats.byStatus[st] = (stats.byStatus[st] || 0) + 1;
        });
        return stats;
    }

    getTypeMeta(typeId) {
        const type = this.incidentTypes.find(t => t.id === typeId);
        return type || { id: typeId, name: typeId || 'Other', icon: 'fa-exclamation-circle', severity: 'medium' };
    }

    getStatusBadgeHtml(status) {
        const s = String(status || 'Submitted').trim();
        switch (s) {
            case 'Submitted':
                return `<span class="status submitted" style="background:rgba(59,130,246,0.12);color:#2563eb;padding:5px 12px;border-radius:999px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-paper-plane"></i> Submitted</span>`;
            case 'Pending':
                return `<span class="status pending" style="background:rgba(245,158,11,0.12);color:#b45309;padding:5px 12px;border-radius:999px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-clock"></i> Pending</span>`;
            case 'Under Review':
                return `<span class="status under-review" style="background:rgba(139,92,246,0.12);color:#7c3aed;padding:5px 12px;border-radius:999px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-magnifying-glass"></i> Under Review</span>`;
            case 'Resolved':
                return `<span class="status resolved" style="background:rgba(16,185,129,0.12);color:#047857;padding:5px 12px;border-radius:999px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-check-circle"></i> Resolved</span>`;
            case 'Rejected':
                return `<span class="status rejected" style="background:rgba(239,68,68,0.12);color:#b91c1c;padding:5px 12px;border-radius:999px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-circle-xmark"></i> Rejected</span>`;
            default:
                return `<span class="status active" style="background:rgba(79,195,247,0.12);color:#0369a1;padding:5px 12px;border-radius:999px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-info-circle"></i> ${s}</span>`;
        }
    }

    getSeverityBadgeHtml(severity) {
        const sev = String(severity || 'medium').toLowerCase();
        let bg = 'rgba(245,158,11,0.12)';
        let color = '#b45309';
        let label = 'Medium';
        if (sev === 'critical') {
            bg = 'rgba(239,68,68,0.15)'; color = '#dc2626'; label = 'Critical';
        } else if (sev === 'high') {
            bg = 'rgba(249,115,22,0.15)'; color = '#ea580c'; label = 'High';
        } else if (sev === 'low') {
            bg = 'rgba(16,185,129,0.12)'; color = '#059669'; label = 'Low';
        }
        return `<span class="severity ${sev}" style="background:${bg};color:${color};padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:capitalize;">${label}</span>`;
    }

    showReportingModal() {
        const existing = document.getElementById('civicsense-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'civicsense-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.65);
            backdrop-filter: blur(4px);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
        `;

        modal.innerHTML = `
            <div style="background: #ffffff; border-radius: 18px; padding: 26px; max-width: 520px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.22); border: 1px solid #e2e8f0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(79,195,247,0.15); color: #0284c7; display: grid; place-items: center; font-size: 18px;">
                            <i class="fas fa-shield-alt"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; color: #1e3a5f; font-size: 20px; font-weight: 800;">Report Safety Incident</h2>
                            <p style="margin: 2px 0 0; color: #64748b; font-size: 13px;">Submit hazards or incidents for review</p>
                        </div>
                    </div>
                    <button type="button" onclick="document.getElementById('civicsense-modal').remove()" 
                            style="background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 50%; font-size: 18px; cursor: pointer; color: #64748b; display: grid; place-items: center;">&times;</button>
                </div>

                <form id="incident-form">
                    <div style="margin-bottom: 18px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 700; color: #1e3a5f; font-size: 14px;">Incident Type *</label>
                        <select id="incident-type" required style="width: 100%; padding: 11px 14px; border: 1.5px solid #cbd5e1; border-radius: 10px; font-size: 14px; background: #fff; color: #1e293b;">
                            ${((this && this.incidentTypes) || (window.civicSense && window.civicSense.incidentTypes) || []).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                        </select>
                    </div>

                    <div style="margin-bottom: 18px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 700; color: #1e3a5f; font-size: 14px;">Severity Level</label>
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                            <label style="border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 8px 4px; text-align: center; cursor: pointer; font-size: 12px; font-weight: 700;">
                                <input type="radio" name="severityRadio" value="low" style="margin-right: 4px;"> Low
                            </label>
                            <label style="border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 8px 4px; text-align: center; cursor: pointer; font-size: 12px; font-weight: 700;">
                                <input type="radio" name="severityRadio" value="medium" checked style="margin-right: 4px;"> Medium
                            </label>
                            <label style="border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 8px 4px; text-align: center; cursor: pointer; font-size: 12px; font-weight: 700;">
                                <input type="radio" name="severityRadio" value="high" style="margin-right: 4px;"> High
                            </label>
                            <label style="border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 8px 4px; text-align: center; cursor: pointer; font-size: 12px; font-weight: 700;">
                                <input type="radio" name="severityRadio" value="critical" style="margin-right: 4px;"> Critical
                            </label>
                        </div>
                    </div>

                    <div style="margin-bottom: 18px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 700; color: #1e3a5f; font-size: 14px;">Incident Details &amp; Description *</label>
                        <textarea id="incident-description" required rows="3" 
                                  placeholder="Describe the hazard or incident in detail (e.g. Broken streetlight causing pitch black sidewalk, suspicious group idling)..."
                                  style="width: 100%; padding: 11px 14px; border: 1.5px solid #cbd5e1; border-radius: 10px; font-size: 14px; resize: vertical;"></textarea>
                    </div>

                    <div style="margin-bottom: 18px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 700; color: #1e3a5f; font-size: 14px;">Location / Landmark</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="incident-address" placeholder="e.g. Near Metro Gate 2, Koramangala 5th Block" 
                                   style="flex: 1; padding: 11px 14px; border: 1.5px solid #cbd5e1; border-radius: 10px; font-size: 14px;">
                            <button type="button" onclick="window.civicSense.useCurrentLocation()" 
                                    style="padding: 11px 16px; background: #1e3a5f; color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 700; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;">
                                <i class="fas fa-location-crosshairs"></i> Use GPS
                            </button>
                        </div>
                        <div id="location-status" style="margin-top: 6px; font-size: 12px; color: #64748b;"></div>
                    </div>

                    <div style="margin-bottom: 22px; background: #f8fafc; border-radius: 10px; padding: 12px 14px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <input type="checkbox" id="anonymous-report" style="width: 18px; height: 18px; accent-color: #1e3a5f;">
                            <div>
                                <span style="font-weight: 700; color: #1e3a5f; font-size: 13px;">Submit Anonymously</span>
                                <div style="font-size: 11px; color: #64748b;">Your identity will be masked in public community feeds. You can still track it in My Reports.</div>
                            </div>
                        </label>
                    </div>

                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button type="button" class="btn btn-outline" onclick="document.getElementById('civicsense-modal').remove()" style="padding: 11px 18px;">Cancel</button>
                        <button type="submit" id="submit-report-btn" class="btn btn-primary" style="padding: 11px 24px; display: inline-flex; align-items: center; gap: 8px;">
                            <i class="fas fa-paper-plane"></i> Submit Incident Report
                        </button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        // Pre-attempt location fetch quietly
        this.useCurrentLocation(false);

        // Bind form submit
        document.getElementById('incident-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-report-btn');
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Submitting...`;

            const type = document.getElementById('incident-type').value;
            const description = document.getElementById('incident-description').value.trim();
            const address = document.getElementById('incident-address').value.trim();
            const anonymous = document.getElementById('anonymous-report').checked;
            const severityRadio = document.querySelector('input[name="severityRadio"]:checked');
            const severity = severityRadio ? severityRadio.value : this.getSeverityForType(type);

            const result = await this.submitIncident({
                type,
                description,
                address,
                anonymous,
                severity,
                location: this.currentReportLocation
            });

            if (result.success) {
                modal.remove();
                this.showSuccessToast(result.report);
            } else {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-paper-plane"></i> Submit Incident Report`;
                alert('Submission failed: ' + (result.error || 'Please try again.'));
            }
        });
    }

    async useCurrentLocation(showStatus = true) {
        const statusEl = document.getElementById('location-status');
        if (showStatus && statusEl) {
            statusEl.textContent = 'Locating GPS coordinates...';
            statusEl.style.color = '#3b82f6';
        }

        try {
            const location = await this.getCurrentLocation();
            this.currentReportLocation = location;
            if (statusEl) {
                const addrInput = document.getElementById('incident-address');
                if (addrInput && !addrInput.value) {
                    addrInput.value = `Lat: ${location.latitude.toFixed(4)}, Lng: ${location.longitude.toFixed(4)}`;
                }
                statusEl.innerHTML = `<i class="fas fa-check-circle"></i> GPS Location captured (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`;
                statusEl.style.color = '#10b981';
            }
        } catch (error) {
            if (statusEl) {
                statusEl.textContent = 'GPS permission unavailable. Please type your location.';
                statusEl.style.color = '#ef4444';
            }
        }
    }

    showSuccessToast(report) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #1e3a5f;
            color: #ffffff;
            padding: 16px 22px;
            border-radius: 14px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.25);
            z-index: 10001;
            display: flex;
            align-items: center;
            gap: 14px;
            max-width: 420px;
            animation: slideUp 0.3s ease;
        `;
        toast.innerHTML = `
            <div style="width: 38px; height: 38px; border-radius: 50%; background: #10b981; display: grid; place-items: center; color: white; font-size: 18px; flex-shrink: 0;">
                <i class="fas fa-check"></i>
            </div>
            <div>
                <div style="font-weight: 800; font-size: 14px;">Incident Report Submitted!</div>
                <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">Report ID: <strong>${report.reportId || report.id}</strong> • Status: <strong>${report.status || 'Submitted'}</strong></div>
            </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4500);
    }

    showReportDetailsModal(report) {
        const existing = document.getElementById('report-detail-modal');
        if (existing) existing.remove();

        const typeMeta = this.getTypeMeta(report.incidentType || report.type);
        const statusBadge = this.getStatusBadgeHtml(report.status);
        const severityBadge = this.getSeverityBadgeHtml(report.severity);
        const formattedDate = new Date(report.createdAt || report.timestamp).toLocaleString();

        const modal = document.createElement('div');
        modal.id = 'report-detail-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.65);
            backdrop-filter: blur(4px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
        `;

        modal.innerHTML = `
            <div style="background: #ffffff; border-radius: 18px; padding: 26px; max-width: 540px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.22); border: 1px solid #e2e8f0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px;">
                    <div>
                        <span style="font-size: 11px; font-weight: 800; color: #64748b; letter-spacing: 0.05em; text-transform: uppercase;">Incident Report Details</span>
                        <h2 style="margin: 4px 0 0; color: #1e3a5f; font-size: 20px; font-weight: 800;">#${report.reportId || report.id}</h2>
                    </div>
                    <button type="button" onclick="document.getElementById('report-detail-modal').remove()" 
                            style="background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 50%; font-size: 18px; cursor: pointer; color: #64748b; display: grid; place-items: center;">&times;</button>
                </div>

                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px;">
                    ${statusBadge}
                    ${severityBadge}
                    <span style="background: #f1f5f9; color: #475569; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fas ${typeMeta.icon}"></i> ${typeMeta.name}
                    </span>
                </div>

                <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 18px; border: 1px solid #e2e8f0;">
                    <div style="margin-bottom: 12px;">
                        <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase;">Incident Description</div>
                        <div style="font-size: 14px; color: #1e293b; margin-top: 4px; line-height: 1.6;">${report.description || 'No description provided'}</div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 10px; border-top: 1px solid #e2e8f0;">
                        <div>
                            <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase;"><i class="fas fa-location-dot"></i> Location</div>
                            <div style="font-size: 13px; color: #1e293b; margin-top: 2px;">${report.address || 'GPS Coordinates'}</div>
                            ${report.latitude && report.longitude ? `<div style="font-size: 11px; color: #64748b;">${Number(report.latitude).toFixed(5)}, ${Number(report.longitude).toFixed(5)}</div>` : ''}
                        </div>
                        <div>
                            <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase;"><i class="far fa-calendar"></i> Date Reported</div>
                            <div style="font-size: 13px; color: #1e293b; margin-top: 2px;">${formattedDate}</div>
                        </div>
                    </div>
                </div>

                <!-- Admin Remarks Section -->
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                    <div style="display: flex; align-items: center; gap: 8px; font-weight: 800; color: #15803d; font-size: 13px; margin-bottom: 6px;">
                        <i class="fas fa-user-shield"></i> Administrative Action &amp; Remarks
                    </div>
                    <div style="font-size: 14px; color: #166534; line-height: 1.5;">
                        ${report.adminRemarks ? report.adminRemarks : '<em style="color:#64748b;">No administrative remarks recorded yet. Your report is securely logged and being reviewed by staff.</em>'}
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end;">
                    <button type="button" class="btn btn-primary" onclick="document.getElementById('report-detail-modal').remove()" style="padding: 10px 20px;">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    renderMyReportsList(container, filterStatus = '') {
        if (!container) return;
        let reports = [...this.myReports];

        if (filterStatus) {
            reports = reports.filter(r => String(r.status).toLowerCase() === String(filterStatus).toLowerCase());
        }

        if (reports.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 42px 20px; border: 1.5px dashed #cbd5e1; border-radius: 16px; background: #f8fbff;">
                    <div style="width: 54px; height: 54px; border-radius: 50%; background: rgba(79,195,247,0.15); color: #0284c7; display: grid; place-items: center; margin: 0 auto 14px; font-size: 22px;">
                        <i class="fas fa-folder-open"></i>
                    </div>
                    <h3 style="margin: 0 0 6px; color: #1e3a5f;">No Reports Found</h3>
                    <p style="margin: 0 0 16px; color: #64748b; font-size: 14px;">${filterStatus ? 'No incident reports match the selected status filter.' : 'You have not submitted any incident reports yet.'}</p>
                    <button class="btn btn-primary" onclick="window.civicSense.showReportingModal()"><i class="fas fa-plus"></i> Report an Incident</button>
                </div>
            `;
            return;
        }

        container.innerHTML = reports.map(report => {
            const typeMeta = this.getTypeMeta(report.incidentType || report.type);
            const statusBadge = this.getStatusBadgeHtml(report.status);
            const severityBadge = this.getSeverityBadgeHtml(report.severity);
            const dateStr = new Date(report.createdAt || report.timestamp).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            return `
                <div class="report-item" style="border: 1px solid #e2e8f0; background: #ffffff; border-radius: 14px; padding: 18px; margin-bottom: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); transition: transform 0.2s ease;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(79,195,247,0.12); color: #0284c7; display: grid; place-items: center; font-size: 18px;">
                                <i class="fas ${typeMeta.icon}"></i>
                            </div>
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <strong style="color: #1e3a5f; font-size: 15px;">${typeMeta.name}</strong>
                                    <span style="font-size: 12px; font-weight: 700; color: #64748b;">#${report.reportId || report.id}</span>
                                </div>
                                <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">
                                    <i class="far fa-clock"></i> ${dateStr}
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            ${severityBadge}
                            ${statusBadge}
                        </div>
                    </div>

                    <p style="margin: 0 0 12px 0; color: #334155; font-size: 14px; line-height: 1.5;">${report.description || 'No description provided'}</p>

                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding-top: 10px; border-top: 1px solid #f1f5f9;">
                        <div style="font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-location-dot" style="color: #0284c7;"></i> ${report.address || 'Location captured via GPS'}
                        </div>
                        <button class="btn btn-outline" style="padding: 6px 14px; font-size: 12px;" onclick='window.civicSense.showReportDetailsModal(${JSON.stringify(report).replace(/'/g, "&apos;")})'>
                            <i class="fas fa-circle-info"></i> View Details
                        </button>
                    </div>

                    ${report.adminRemarks ? `
                        <div style="margin-top: 12px; background: #f0fdf4; border-left: 3px solid #16a34a; padding: 10px 14px; border-radius: 6px; font-size: 13px; color: #166534;">
                            <strong><i class="fas fa-user-shield"></i> Admin Remark:</strong> ${report.adminRemarks}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }
}

// Global singleton instance
window.civicSense = new CivicSenseReporting();

// Auto-bind report buttons across the site
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-action="report-incident"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            window.civicSense.showReportingModal();
        });
    });

    // Initial background sync for logged in user's reports
    if (window.civicSense) {
        window.civicSense.fetchMyReports();
    }
});
