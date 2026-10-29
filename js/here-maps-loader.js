/*
  [RETIRED & UNUSED] SecureStep - HERE Maps Integration Module
  Migrated to Keyless MapLibre GL JS & OpenFreeMap (js/map-loader.js).
*/
(function() {
    'use strict';
    // Stub for any legacy callers
    window.loadHereMapsApi = function() {
        if (window.loadMapLibreApi) return window.loadMapLibreApi();
        return Promise.resolve({
            platform: null,
            defaultLayers: null,
            apiKey: ''
        });
    };
})();
