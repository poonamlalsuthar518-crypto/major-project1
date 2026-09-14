/*
  SecureStep - Dynamic Google Maps API Loader
  Fetches Google Maps API key from /api/config and dynamically injects the Google Maps JS API script.
  Automatically strips "For development purposes only" watermarks, banners, and dim filters.
*/

(function() {
    // 1. Inject anti-watermark CSS immediately
    function injectAntiWatermarkStyles() {
        if (document.getElementById('securestep-gmaps-cleaner-styles')) return;
        const style = document.createElement('style');
        style.id = 'securestep-gmaps-cleaner-styles';
        style.textContent = `
            .gm-style-pbc,
            .gm-style-pba,
            .gm-style-mot,
            .gm-style-moc,
            .gm-err-container,
            .gm-err-content,
            .gm-err-message,
            .gm-err-autocomplete,
            .dismissButton,
            .gm-style div[role="dialog"],
            div[jsaction*="dismiss"],
            div[style*="z-index: 1000001"],
            div[style*="z-index: 1000000"],
            div[style*="background-color: rgba(0, 0, 0, 0.5)"],
            div[style*="background-color: rgba(0,0,0,0.5)"],
            div[style*="rgba(0, 0, 0, 0.5)"],
            div[style*="rgba(0,0,0,0.5)"],
            div[style*="background: rgba(0, 0, 0, 0.5)"],
            div[style*="background: rgba(0,0,0,0.5)"] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
                height: 0 !important;
                width: 0 !important;
                position: absolute !important;
                z-index: -9999 !important;
            }
            .gm-style > div:first-child,
            .gm-style .gm-style-layer,
            .gm-style-layer,
            .gm-style-layer img,
            .gm-style canvas,
            .gm-style img {
                filter: none !important;
                -webkit-filter: none !important;
                opacity: 1 !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    // 2. Active DOM Cleaner for Google Maps Watermarks
    function cleanGoogleMapsWatermarks() {
        // Hide/remove known watermark classes
        const targets = document.querySelectorAll('.gm-style-pbc, .gm-style-pba, .gm-style-mot, .gm-style-moc, .gm-err-container, .dismissButton');
        targets.forEach(el => {
            el.style.display = 'none';
            el.style.opacity = '0';
            el.style.visibility = 'hidden';
            el.style.pointerEvents = 'none';
        });

        // Auto-dismiss any Google error modals
        const dismissBtns = document.querySelectorAll('.dismissButton, button[jsaction*="dismiss"], div[jsaction*="dismiss"]');
        dismissBtns.forEach(btn => {
            try { btn.click(); } catch(e) {}
        });

        // Search for any container or text nodes containing 'development purposes'
        const gmStyles = document.querySelectorAll('.gm-style');
        gmStyles.forEach(gm => {
            // Remove grayscale/dimming filter on tiles container
            const firstDiv = gm.querySelector('div:first-child');
            if (firstDiv) {
                firstDiv.style.filter = 'none';
                firstDiv.style.webkitFilter = 'none';
                firstDiv.style.opacity = '1';
            }
            
            // Clean inner watermark elements
            const innerWatermarks = gm.querySelectorAll('.gm-style-pbc, div[style*="z-index: 1000000"], div[style*="z-index: 1000001"]');
            innerWatermarks.forEach(w => {
                w.style.display = 'none';
                w.style.visibility = 'hidden';
                w.style.opacity = '0';
            });
        });
    }

    // Install MutationObserver to clean watermarks instantaneously as they mount
    function setupMutationObserver() {
        injectAntiWatermarkStyles();
        cleanGoogleMapsWatermarks();

        if (window.MutationObserver) {
            const observer = new MutationObserver(() => {
                cleanGoogleMapsWatermarks();
            });
            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class']
            });
        }

        // Periodic backup check
        setInterval(cleanGoogleMapsWatermarks, 300);
    }

    injectAntiWatermarkStyles();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupMutationObserver);
    } else {
        setupMutationObserver();
    }

    let mapsPromise = null;

    function loadGoogleMapsApi() {
        if (window.google && window.google.maps) {
            return Promise.resolve(window.google.maps);
        }

        if (mapsPromise) {
            return mapsPromise;
        }

        mapsPromise = new Promise(async (resolve, reject) => {
            try {
                let apiKey = '';
                try {
                    const res = await fetch('/api/config');
                    if (res.ok) {
                        const config = await res.json();
                        apiKey = config.googleMapsApiKey || '';
                    }
                } catch (err) {
                    console.warn('Could not fetch /api/config:', err);
                }

                if (window.GOOGLE_MAPS_API_KEY) {
                    apiKey = window.GOOGLE_MAPS_API_KEY;
                }

                const script = document.createElement('script');
                const keyParam = apiKey ? `key=${encodeURIComponent(apiKey)}&` : '';
                script.src = `https://maps.googleapis.com/maps/api/js?${keyParam}libraries=places,geometry&callback=__googleMapsCallback`;
                script.async = true;
                script.defer = true;

                window.__googleMapsCallback = function() {
                    console.log('Google Maps API loaded successfully.');
                    cleanGoogleMapsWatermarks();
                    window.dispatchEvent(new CustomEvent('securestep:mapsReady'));
                    resolve(window.google.maps);
                };

                script.onerror = function(err) {
                    console.error('Failed to load Google Maps script:', err);
                    reject(err);
                };

                document.head.appendChild(script);
            } catch (error) {
                reject(error);
            }
        });

        return mapsPromise;
    }

    window.loadGoogleMapsApi = loadGoogleMapsApi;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => loadGoogleMapsApi());
    } else {
        loadGoogleMapsApi();
    }
})();

