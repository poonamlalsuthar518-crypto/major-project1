/*
 CivicSense Incident Reporting Module for SecureStep
 Allows anonymous reporting of unsafe events, hazards, and community safety issues
*/

class CivicSenseReporting {
    constructor() {
        this.incidentTypes = [
            { id: 'theft', name: 'Theft/Pickpocketing', icon: 'fa-hand-holding-dollar', severity: 'high' },
            { id: 'harassment', name: 'Harassment', icon: 'fa-user-shield', severity: 'high' },
            { id: 'assault', name: 'Assault', icon: 'fa-fist-raised', severity: 'critical' },
            { id: 'poor_lighting', name: 'Poor Street Lighting', icon: 'fa-lightbulb', severity: 'medium' },
            { id: 'broken_road', name: 'Broken Road/Potholes', icon: 'fa-road', severity: 'medium' },
            { id: 'suspicious_activity', name: 'Suspicious Activity', icon: 'fa-eye', severity: 'high' },
            { id: 'accident', name: 'Accident', icon: 'fa-car-crash', severity: 'critical' },
            { id: 'vandalism', name: 'Vandalism', icon: 'fa-spray-can', severity: 'low' },
            { id: 'other', name: 'Other', icon: 'fa-exclamation-circle', severity: 'medium' }
        ];
        this.recentReports = [];
        this.loadRecentReports();
    }

    // Load recent reports from localStorage
    loadRecentReports() {
        const stored = localStorage.getItem('civicSenseReports');
        if (stored) {
            this.recentReports = JSON.parse(stored);
        }
    }

    saveReports() {
        localStorage.setItem('civicSenseReports', JSON.stringify(this.recentReports));
    }

    // Get current location for incident reporting
    async getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
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
                (error) => reject(error),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });
    }

    // Submit incident report
    async submitIncident(reportData) {
        try {
            // Get location if not provided
            if (!reportData.location) {
                reportData.location = await this.getCurrentLocation();
            }

            // Add metadata
            const incident = {
                id: this.generateIncidentId(),
                type: reportData.type,
                description: reportData.description,
                location: reportData.location,
                address: reportData.address || 'Unknown location',
                severity: this.getSeverityForType(reportData.type),
                anonymous: reportData.anonymous !== false, // Default to anonymous
                timestamp: new Date().toISOString(),
                status: 'pending', // pending, verified, resolved
                userId: this.getCurrentUserId()
            };

            // Send to backend
            await this.sendToBackend(incident);

            // Add to local reports
            this.recentReports.unshift(incident);
            if (this.recentReports.length > 50) {
                this.recentReports.pop(); // Keep only last 50
            }
            this.saveReports();

            return { success: true, incident };

        } catch (error) {
            console.error('Failed to submit incident:', error);
            return { success: false, error: error.message };
        }
    }

    async sendToBackend(incident) {
        try {
            await fetch('/api/civicsense/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(incident)
            });
        } catch (error) {
            console.error('Failed to send incident to backend:', error);
            // Continue with local storage even if backend fails
        }
    }

    generateIncidentId() {
        return 'INC_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    getSeverityForType(typeId) {
        const type = this.incidentTypes.find(t => t.id === typeId);
        return type ? type.severity : 'medium';
    }

    getCurrentUserId() {
        const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        return user.email || 'anonymous';
    }

    // Get incident types for UI
    getIncidentTypes() {
        return this.incidentTypes;
    }

    // Get recent reports for dashboard
    getRecentReports(limit = 10) {
        return this.recentReports.slice(0, limit);
    }

    // Get reports near a location
    getReportsNearLocation(latitude, longitude, radiusKm = 5) {
        return this.recentReports.filter(report => {
            if (!report.location) return false;
            const distance = this.calculateDistance(
                latitude, longitude,
                report.location.latitude, report.location.longitude
            );
            return distance <= radiusKm;
        });
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // Get incident statistics
    getStatistics(timeRange = 24) {
        // timeRange in hours
        const cutoff = new Date(Date.now() - timeRange * 60 * 60 * 1000);
        const recentReports = this.recentReports.filter(r => new Date(r.timestamp) > cutoff);

        const stats = {
            total: recentReports.length,
            byType: {},
            bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
            byStatus: { pending: 0, verified: 0, resolved: 0 }
        };

        recentReports.forEach(report => {
            // By type
            if (!stats.byType[report.type]) stats.byType[report.type] = 0;
            stats.byType[report.type]++;

            // By severity
            if (stats.bySeverity[report.severity] !== undefined) {
                stats.bySeverity[report.severity]++;
            }

            // By status
            if (stats.byStatus[report.status] !== undefined) {
                stats.byStatus[report.status]++;
            }
        });

        return stats;
    }

    // Show incident reporting modal
    showReportingModal() {
        const modal = document.createElement('div');
        modal.id = 'civicsense-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; padding: 30px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #1e3a5f;">Report Incident</h2>
                    <button onclick="document.getElementById('civicsense-modal').remove()" 
                            style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                </div>

                <form id="incident-form">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #1e3a5f;">Incident Type</label>
                        <select id="incident-type" required style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
                            ${this.incidentTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                        </select>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #1e3a5f;">Description</label>
                        <textarea id="incident-description" required rows="4" 
                                  placeholder="Describe what happened..."
                                  style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 14px; resize: vertical;"></textarea>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #1e3a5f;">Location</label>
                        <div style="display: flex; gap: 10px;">
                            <input type="text" id="incident-address" placeholder="Address (optional)" 
                                   style="flex: 1; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
                            <button type="button" onclick="window.civicSense.useCurrentLocation()" 
                                    style="padding: 12px 16px; background: #1e3a5f; color: white; border: none; border-radius: 8px; cursor: pointer;">
                                <i class="fas fa-location-arrow"></i> Use GPS
                            </button>
                        </div>
                        <div id="location-status" style="margin-top: 8px; font-size: 12px; color: #64748b;"></div>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="anonymous-report" checked>
                            <span style="color: #1e3a5f;">Submit anonymously</span>
                        </label>
                    </div>

                    <button type="submit" 
                            style="width: 100%; padding: 14px; background: linear-gradient(135deg, #1e3a5f 0%, #2c5282 100%); color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;">
                        Submit Report
                    </button>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        // Bind form submission
        document.getElementById('incident-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });
    }

    async useCurrentLocation() {
        const statusEl = document.getElementById('location-status');
        statusEl.textContent = 'Getting location...';

        try {
            const location = await this.getCurrentLocation();
            this.currentReportLocation = location;
            statusEl.textContent = `Location captured: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
            statusEl.style.color = '#10b981';
        } catch (error) {
            statusEl.textContent = 'Failed to get location. Please enable GPS.';
            statusEl.style.color = '#ef4444';
        }
    }

    async handleFormSubmit() {
        const type = document.getElementById('incident-type').value;
        const description = document.getElementById('incident-description').value;
        const address = document.getElementById('incident-address').value;
        const anonymous = document.getElementById('anonymous-report').checked;

        const reportData = {
            type,
            description,
            address,
            anonymous,
            location: this.currentReportLocation
        };

        const result = await this.submitIncident(reportData);

        if (result.success) {
            document.getElementById('civicsense-modal').remove();
            this.showSuccessMessage();
        } else {
            alert('Failed to submit report: ' + result.error);
        }
    }

    showSuccessMessage() {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #10b981;
            color: white;
            padding: 16px 24px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 10001;
            display: flex;
            align-items: center;
            gap: 12px;
            font-weight: 600;
        `;
        toast.innerHTML = `<i class="fas fa-check-circle"></i> Incident reported successfully`;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 4000);
    }

    // Format report for display
    formatReportForDisplay(report) {
        const type = this.incidentTypes.find(t => t.id === report.type);
        const timeAgo = this.getTimeAgo(report.timestamp);
        
        return {
            ...report,
            typeName: type ? type.name : report.type,
            typeIcon: type ? type.icon : 'fa-exclamation-circle',
            timeAgo,
            severityColor: this.getSeverityColor(report.severity)
        };
    }

    getTimeAgo(timestamp) {
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
        const colors = {
            critical: '#ef4444',
            high: '#f59e0b',
            medium: '#3b82f6',
            low: '#10b981'
        };
        return colors[severity] || '#64748b';
    }
}

// Initialize global instance
window.civicSense = new CivicSenseReporting();

// Auto-bind report button if exists
document.addEventListener('DOMContentLoaded', () => {
    const reportButton = document.querySelector('[data-action="report-incident"]');
    if (reportButton) {
        reportButton.addEventListener('click', () => window.civicSense.showReportingModal());
    }
});
