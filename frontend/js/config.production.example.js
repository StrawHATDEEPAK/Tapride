// Committed fallback used ONLY when frontend/js/config.js doesn't exist in
// the build context - which is exactly the case when Render builds from your
// GitHub repo, since config.js is gitignored for local dev flexibility (see
// frontend/Dockerfile's fallback RUN step for how this gets picked up
// automatically). No real secret lives in this file anymore (that was only
// true back when Mapbox needed a token - the OpenFreeMap/Nominatim switch
// removed that requirement), which is what makes committing this safe.
//
// URLs below assume the exact service names set in render.yaml
// (tapride-order-service, etc) - Render's URL pattern is predictable:
// https://<service-name>.onrender.com. If you rename a service in the Render
// dashboard, update the matching URL here and redeploy.
export const CONFIG = {
    MAP_STYLE_URL: 'https://tiles.openfreemap.org/styles/dark',

    API: {
        ORDER: 'https://tapride-order-service.onrender.com',
        PAYMENT: 'https://tapride-payment-service.onrender.com',
        MATCHING: 'https://tapride-matching-service.onrender.com',
        NOTIFICATION_WS: 'https://tapride-notification-service.onrender.com/ws',
    },

    MAP: {
        centerLat: 22.7196,
        centerLng: 75.8577,
        zoom: 12,
    },
};
