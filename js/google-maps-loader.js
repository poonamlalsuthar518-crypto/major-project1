/*
  [RETIRED & UNUSED] SecureStep - Google Maps API Loader
  Migrated to Keyless MapLibre GL JS & OpenFreeMap (js/map-loader.js).
*/
(function() {
    'use strict';
    // Stub for any legacy callers
    window.loadGoogleMapsApi = function() {
        if (window.loadMapLibreApi) return window.loadMapLibreApi();
        return Promise.resolve();
    };
})();
