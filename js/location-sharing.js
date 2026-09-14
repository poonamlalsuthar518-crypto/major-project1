/*
 Live Location Sharing Module for SecureStep
 Allows users to share real-time location with trusted contacts
*/

class LocationSharing {
    constructor() {
        this.isSharing = false;
        this.watchId = null;
        this.sharedWith = [];
        this.currentLocation = null;
        this.sharingInterval = null;
        this.updateFrequency = 30000; // Update every 30 seconds
    }

    // Initialize trusted contacts
    initializeContacts() {
        const stored = localStorage.getItem('trustedContacts');
        if (stored) {
            this.sharedWith = JSON.parse(stored);
        } else {
            // Default trusted contacts
            this.sharedWith = [
                { name: 'Family Contact', phone: '', email: '', type: 'family' }
            ];
            this.saveContacts();
        }
    }

    saveContacts() {
        localStorage.setItem('trustedContacts', JSON.stringify(this.sharedWith));
    }

    addContact(name, phone, email, type) {
        this.sharedWith.push({ name, phone, email, type });
        this.saveContacts();
    }

    removeContact(index) {
        this.sharedWith.splice(index, 1);
        this.saveContacts();
    }

    // Start live location sharing
    async startSharing(duration = 3600000) {
        // Default: share for 1 hour
        if (this.isSharing) return;

        try {
            // Get initial location
            await this.getCurrentLocation();
            
            // Start watching position
            this.isSharing = true;
            this.watchId = navigator.geolocation.watchPosition(
                (position) => this.handlePositionUpdate(position),
                (error) => this.handleLocationError(error),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
            );

            // Start periodic updates to server
            this.startPeriodicUpdates();

            // Set auto-stop timer
            setTimeout(() => this.stopSharing(), duration);

            // Show sharing indicator
            this.showSharingIndicator();

            // Notify contacts
            await this.notifyContacts('START');

        } catch (error) {
            console.error('Failed to start location sharing:', error);
            this.isSharing = false;
            throw error;
        }
    }

    stopSharing() {
        if (!this.isSharing) return;

        // Stop watching position
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }

        // Stop periodic updates
        if (this.sharingInterval) {
            clearInterval(this.sharingInterval);
            this.sharingInterval = null;
        }

        this.isSharing = false;

        // Hide sharing indicator
        this.hideSharingIndicator();

        // Notify contacts
        this.notifyContacts('STOP');
    }

    async getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.currentLocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        speed: position.coords.speed,
                        heading: position.coords.heading,
                        timestamp: new Date().toISOString()
                    };
                    resolve(this.currentLocation);
                },
                (error) => reject(error),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });
    }

    handlePositionUpdate(position) {
        this.currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            heading: position.coords.heading,
            timestamp: new Date().toISOString()
        };

        // Update UI if sharing indicator is visible
        this.updateSharingIndicator();
    }

    handleLocationError(error) {
        console.error('Location error:', error);
        switch(error.code) {
            case error.PERMISSION_DENIED:
                alert('Location permission denied. Please enable GPS.');
                break;
            case error.POSITION_UNAVAILABLE:
                alert('Location information unavailable.');
                break;
            case error.TIMEOUT:
                alert('Location request timed out.');
                break;
        }
        this.stopSharing();
    }

    startPeriodicUpdates() {
        this.sharingInterval = setInterval(async () => {
            if (this.currentLocation) {
                await this.sendLocationUpdate();
            }
        }, this.updateFrequency);
    }

    async sendLocationUpdate() {
        const updateData = {
            userId: this.getCurrentUserId(),
            location: this.currentLocation,
            sharedWith: this.sharedWith,
            timestamp: new Date().toISOString()
        };

        try {
            await fetch('/api/location/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
        } catch (error) {
            console.error('Failed to send location update:', error);
        }
    }

    async notifyContacts(action) {
        const notificationData = {
            action, // 'START' or 'STOP'
            userId: this.getCurrentUserId(),
            contacts: this.sharedWith,
            location: this.currentLocation,
            timestamp: new Date().toISOString()
        };

        try {
            await fetch('/api/location/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(notificationData)
            });
        } catch (error) {
            console.error('Failed to notify contacts:', error);
        }
    }

    getCurrentUserId() {
        const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        return user.email || 'anonymous';
    }

    showSharingIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'location-sharing-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #1e3a5f 0%, #2c5282 100%);
            color: white;
            padding: 15px 20px;
            border-radius: 12px;
            box-shadow: 0 8px 25px rgba(30, 58, 95, 0.3);
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 14px;
            font-weight: 600;
        `;
        indicator.innerHTML = `
            <div style="width: 12px; height: 12px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite;"></div>
            <div>
                <div style="font-weight: 700;">Live Location Sharing</div>
                <div style="font-size: 12px; opacity: 0.9;" id="sharing-time">Sharing with ${this.sharedWith.length} contacts</div>
            </div>
            <button onclick="window.locationSharing.stopSharing()" 
                    style="background: rgba(255,255,255,0.2); border: none; color: white; 
                           padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                Stop
            </button>
            <style>
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.2); }
                }
            </style>
        `;
        document.body.appendChild(indicator);
    }

    updateSharingIndicator() {
        const timeEl = document.getElementById('sharing-time');
        if (timeEl && this.currentLocation) {
            const time = new Date(this.currentLocation.timestamp).toLocaleTimeString();
            timeEl.textContent = `Updated: ${time} • Sharing with ${this.sharedWith.length} contacts`;
        }
    }

    hideSharingIndicator() {
        const indicator = document.getElementById('location-sharing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    // Get sharing history
    async getSharingHistory() {
        try {
            const response = await fetch(`/api/location/history/${this.getCurrentUserId()}`);
            const data = await response.json();
            return data.history || [];
        } catch (error) {
            console.error('Failed to get sharing history:', error);
            return [];
        }
    }

    // Share current location one-time (not live tracking)
    async shareCurrentLocation() {
        try {
            await this.getCurrentLocation();
            
            const shareData = {
                userId: this.getCurrentUserId(),
                location: this.currentLocation,
                sharedWith: this.sharedWith,
                timestamp: new Date().toISOString(),
                type: 'one-time'
            };

            await fetch('/api/location/share-once', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(shareData)
            });

            return true;
        } catch (error) {
            console.error('Failed to share current location:', error);
            return false;
        }
    }
}

// Initialize global instance
window.locationSharing = new LocationSharing();
window.locationSharing.initializeContacts();

// Auto-bind location sharing buttons if they exist
document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.querySelector('[data-action="start-sharing"]');
    const stopButton = document.querySelector('[data-action="stop-sharing"]');
    const shareOnceButton = document.querySelector('[data-action="share-once"]');

    if (startButton) {
        startButton.addEventListener('click', () => window.locationSharing.startSharing());
    }
    if (stopButton) {
        stopButton.addEventListener('click', () => window.locationSharing.stopSharing());
    }
    if (shareOnceButton) {
        shareOnceButton.addEventListener('click', () => window.locationSharing.shareCurrentLocation());
    }
});
