import { store, haversine } from './state.js';
import { reverseGeocode } from './geocoding.js';

const VEHICLE_EMOJI = { Hatchback: '🚗', Sedan: '🚙', SUV: '🚙', 'Auto-rickshaw': '🛺' };

/** Deterministic fake rating (4.5-4.9) from a driver ID, so it's stable per driver, not re-randomized every render. */
function fakeRating(driverId) {
    let hash = 0;
    for (let i = 0; i < driverId.length; i++) hash = (hash * 31 + driverId.charCodeAt(i)) | 0;
    return (4.5 + Math.abs(hash % 50) / 100).toFixed(1);
}

// Mapbox's own documented "animate a line" dash sequence - cycling through
// these paint-property values is the standard technique for a marching-ants
// effect on a map line layer, since there's no native animated-dash paint property.
const DASH_SEQUENCE = [
    [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
    [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];

function makeDotEl(color, size) {
    const el = document.createElement('div');
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.borderRadius = '50%';
    el.style.background = color;
    el.style.border = '2px solid rgba(255,255,255,0.9)';
    el.style.boxShadow = `0 0 0 5px ${color}33`;
    return el;
}

/** type: 'car' | 'pin' | 'flag' - the 3 "hero" markers for the selected ride, real icons instead of plain dots.
 * Returns { el, inner } - MapLibre positions `el` (sets its transform directly for
 * map projection), while `inner` is a separate child element safe to animate
 * (e.g. the arrival bounce) without fighting MapLibre's own positioning transform
 * on the same property. */
function makeIconEl(type, color) {
    const el = document.createElement('div');
    const inner = document.createElement('div');
    inner.className = 'marker-inner';
    inner.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))';

    if (type === 'car') {
        inner.innerHTML = `
            <svg width="30" height="30" viewBox="0 0 24 24">
                <rect x="7" y="2" width="10" height="20" rx="3" fill="${color}" stroke="white" stroke-width="1"/>
                <rect x="8.5" y="5" width="7" height="5" rx="1" fill="rgba(0,0,0,0.3)"/>
                <rect x="8.5" y="15" width="7" height="4" rx="1" fill="rgba(0,0,0,0.2)"/>
            </svg>`;
    } else if (type === 'pin') {
        inner.innerHTML = `
            <svg width="26" height="26" viewBox="0 0 24 24">
                <path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 8 12 8 12s8-6.75 8-12c0-4.42-3.58-8-8-8z" fill="${color}" stroke="white" stroke-width="1"/>
                <circle cx="12" cy="10" r="3" fill="white"/>
            </svg>`;
    } else if (type === 'flag') {
        inner.innerHTML = `
            <svg width="26" height="26" viewBox="0 0 24 24">
                <line x1="6" y1="21" x2="6" y2="3" stroke="white" stroke-width="2"/>
                <path d="M6 4l14 5-14 5V4z" fill="${color}"/>
            </svg>`;
    }
    el.appendChild(inner);
    return el;
}

class MapController extends EventTarget {
    constructor() {
        super();
        this.map = null;
        this.bookingPins = { pickup: null, dropoff: null };
        this.pickMode = null;

        this.selectedMarkers = { pickup: null, dropoff: null, driver: null };
        this.cityDots = new Map();
        this.availableDriverMarkers = [];
        this.trails = new Map();
        this.animTokens = new Map();
        this.lastRenderedRideId = null;
        this.dashIndex = 0;
    }

    async init(config) {
        this.config = config;
        const center = await this._resolveInitialCenter(config);

        this.map = new maplibregl.Map({
            container: 'map',
            style: config.MAP_STYLE_URL,
            center: [center.lng, center.lat],
            zoom: config.MAP.zoom,
        });

        this.map.on('click', (e) => this._handleMapClick(e));

        this.map.on('load', () => {
            this.map.addSource('driver-trail', {
                type: 'geojson', lineMetrics: true,
                data: { type: 'FeatureCollection', features: [] },
            });
            this.map.addLayer({
                id: 'driver-trail-layer', type: 'line', source: 'driver-trail',
                paint: {
                    'line-width': 3,
                    'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(63,184,175,0)', 1, 'rgba(63,184,175,0.8)'],
                },
            });

            // The "path ahead" - animated dashed line from the driver's
            // current position to wherever they're currently heading
            // (pickup, then dropoff once the trip starts).
            this.map.addSource('route-ahead', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            this.map.addLayer({
                id: 'route-ahead-layer', type: 'line', source: 'route-ahead',
                paint: { 'line-color': '#F2A340', 'line-width': 3, 'line-opacity': 0.7, 'line-dasharray': [0, 4, 3] },
            });
            setInterval(() => {
                if (!this.map.getLayer('route-ahead-layer')) return;
                this.dashIndex = (this.dashIndex + 1) % DASH_SEQUENCE.length;
                this.map.setPaintProperty('route-ahead-layer', 'line-dasharray', DASH_SEQUENCE[this.dashIndex]);
            }, 100);
        });

        store.addEventListener('change', () => this._onStoreChange());
        store.addEventListener('select', () => this._onSelectionChange());
        store.addEventListener('position', (e) => this._onPosition(e.detail.rideId));
        store.addEventListener('ride-started', (e) => this._onRideStarted(e.detail.rideId));

        this._loadAvailableDrivers();
        setInterval(() => this._loadAvailableDrivers(), 15000);
    }

    async _resolveInitialCenter(config) {
        if (!navigator.geolocation) return { lat: config.MAP.centerLat, lng: config.MAP.centerLng };
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve({ lat: config.MAP.centerLat, lng: config.MAP.centerLng }), 4000);
            navigator.geolocation.getCurrentPosition(
                (pos) => { clearTimeout(timeout); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
                () => { clearTimeout(timeout); resolve({ lat: config.MAP.centerLat, lng: config.MAP.centerLng }); },
                { timeout: 3500 }
            );
        });
    }

    // ---------------- Available-drivers preview (before booking) ----------------

    async _loadAvailableDrivers() {
        try {
            const res = await fetch(`${this.config.API.MATCHING}/api/matches/drivers/available`);
            const drivers = await res.json();
            this.availableDriverMarkers.forEach((m) => m.remove());
            this.availableDriverMarkers = drivers.map((d) => {
                const el = makeDotEl('#9CA0B8', 12);
                el.style.opacity = '0.55'; // visually distinct from an actual matched driver
                return new maplibregl.Marker({ element: el }).setLngLat([d.lng, d.lat]).addTo(this.map);
            });
        } catch {
            // Non-critical preview feature - fail silently rather than
            // disrupting the booking flow if matching-service is briefly unreachable.
        }
    }

    // ---------------- Booking mode ----------------

    enterPickMode(which) {
        this.pickMode = which;
        this.map.getCanvas().style.cursor = 'crosshair';
    }

    async _handleMapClick(e) {
        if (!this.pickMode) return;
        const { lat, lng } = e.lngLat;
        await this._setBookingPin(this.pickMode, lat, lng);
        this.pickMode = null;
        this.map.getCanvas().style.cursor = '';
    }

    async _setBookingPin(which, lat, lng) {
        const type = which === 'pickup' ? 'pin' : 'flag';
        const color = which === 'pickup' ? '#3FB8AF' : '#E8604C';
        let pin = this.bookingPins[which];

        if (!pin) {
            const marker = new maplibregl.Marker({ element: makeIconEl(type, color), draggable: true })
                .setLngLat([lng, lat]).addTo(this.map);
            marker.on('dragend', () => {
                const pos = marker.getLngLat();
                this._setBookingPin(which, pos.lat, pos.lng);
            });
            pin = { marker, lat, lng, label: '' };
            this.bookingPins[which] = pin;
        } else {
            pin.marker.setLngLat([lng, lat]);
            pin.lat = lat;
            pin.lng = lng;
        }

        pin.label = 'Locating address…';
        this._dispatchSelectionChange();
        pin.label = await reverseGeocode(lat, lng);
        this._dispatchSelectionChange();
    }

    setPointFromSearch(which, { lat, lng, label }) {
        const type = which === 'pickup' ? 'pin' : 'flag';
        const color = which === 'pickup' ? '#3FB8AF' : '#E8604C';
        let pin = this.bookingPins[which];
        if (!pin) {
            const marker = new maplibregl.Marker({ element: makeIconEl(type, color), draggable: true })
                .setLngLat([lng, lat]).addTo(this.map);
            marker.on('dragend', () => {
                const pos = marker.getLngLat();
                this._setBookingPin(which, pos.lat, pos.lng);
            });
            pin = { marker, lat, lng, label };
            this.bookingPins[which] = pin;
        } else {
            pin.marker.setLngLat([lng, lat]);
            pin.lat = lat;
            pin.lng = lng;
            pin.label = label;
        }
        this.map.flyTo({ center: [lng, lat], zoom: Math.max(this.map.getZoom(), 13), duration: 500 });
        this._dispatchSelectionChange();
    }

    getBookingSelection() {
        return {
            pickup: this.bookingPins.pickup ? { lat: this.bookingPins.pickup.lat, lng: this.bookingPins.pickup.lng, label: this.bookingPins.pickup.label } : null,
            dropoff: this.bookingPins.dropoff ? { lat: this.bookingPins.dropoff.lat, lng: this.bookingPins.dropoff.lng, label: this.bookingPins.dropoff.label } : null,
        };
    }

    clearBookingPins() {
        this.bookingPins.pickup?.marker.remove();
        this.bookingPins.dropoff?.marker.remove();
        this.bookingPins = { pickup: null, dropoff: null };
        this._dispatchSelectionChange();
    }

    _dispatchSelectionChange() {
        this.dispatchEvent(new CustomEvent('booking-selection-changed', { detail: this.getBookingSelection() }));
    }

    // ---------------- Tracking mode (live rides) ----------------

    _onStoreChange() {
        this._renderCityDots();
        if (store.selectedRideId !== this.lastRenderedRideId) this._rebuildSelected();
        else this._updateRouteAhead();
    }

    _onSelectionChange() {
        this._rebuildSelected();
        this._renderCityDots();
    }

    _onPosition(rideId) {
        this._renderCityDots();
        if (rideId === store.selectedRideId) {
            this._animateSelectedDriver(rideId);
            this._updateRouteAhead();
        }
    }

    _onRideStarted(rideId) {
        if (rideId !== store.selectedRideId || !this.selectedMarkers.driver) return;
        const inner = this.selectedMarkers.driver.getElement().querySelector('.marker-inner');
        inner.classList.add('marker-bounce');
        inner.addEventListener('animationend', () => inner.classList.remove('marker-bounce'), { once: true });
    }

    _rebuildSelected() {
        this.selectedMarkers.pickup?.remove();
        this.selectedMarkers.dropoff?.remove();
        this.selectedMarkers.driver?.remove();
        this.selectedMarkers = { pickup: null, dropoff: null, driver: null };
        this.lastRenderedRideId = store.selectedRideId;

        const ride = store.getSelected();
        if (!ride || !ride.pickup || !ride.dropoff) {
            this._updateRouteAhead();
            return;
        }

        this.clearBookingPins();

        this.selectedMarkers.pickup = new maplibregl.Marker({ element: makeIconEl('pin', '#3FB8AF') })
            .setLngLat([ride.pickup.lng, ride.pickup.lat]).addTo(this.map);
        this.selectedMarkers.dropoff = new maplibregl.Marker({ element: makeIconEl('flag', '#E8604C') })
            .setLngLat([ride.dropoff.lng, ride.dropoff.lat]).addTo(this.map);

        if (ride.driverPos) {
            this.selectedMarkers.driver = this._makeDriverMarker(ride);
        }

        this.trails.set(ride.id, ride.driverPos ? [[ride.driverPos.lng, ride.driverPos.lat]] : []);
        this._updateTrailLayer(ride.id);
        this._updateRouteAhead();

        const bounds = new maplibregl.LngLatBounds()
            .extend([ride.pickup.lng, ride.pickup.lat])
            .extend([ride.dropoff.lng, ride.dropoff.lat]);
        this.map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 600 });
    }

    /** Driver marker with click-to-show info card - the popup content is fetched fresh on each click, not cached. */
    _makeDriverMarker(ride) {
        const el = makeIconEl('car', '#F2A340');
        const inner = el.querySelector('.marker-inner');
        inner.style.cursor = 'pointer';
        const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
            .setLngLat([ride.driverPos.lng, ride.driverPos.lat]).addTo(this.map);

        inner.addEventListener('click', async (evt) => {
            evt.stopPropagation();
            const popup = new maplibregl.Popup({ offset: 20, closeButton: true })
                .setLngLat(marker.getLngLat())
                .setHTML(`<div style="font-family:sans-serif;">Loading…</div>`)
                .addTo(this.map);
            try {
                const res = await fetch(`${this.config.API.MATCHING}/api/matches/by-ride/${ride.id}`);
                const match = await res.json();
                const emoji = VEHICLE_EMOJI[match.driverVehicle] ?? '🚗';
                popup.setHTML(`
                    <div style="font-family:sans-serif; padding:2px;">
                        <div style="font-weight:600; font-size:14px;">${emoji} ${match.driverName ?? 'Driver'}</div>
                        <div style="font-size:12px; color:#666;">${match.driverVehicle ?? ''}</div>
                        <div style="font-size:12px; margin-top:4px;">⭐ ${fakeRating(match.driverId)}</div>
                    </div>
                `);
            } catch {
                popup.setHTML(`<div style="font-family:sans-serif;">Driver info unavailable</div>`);
            }
        });

        return marker;
    }

    _animateSelectedDriver(rideId) {
        const ride = store.rides.get(rideId);
        if (!ride?.driverPos) return;

        if (!this.selectedMarkers.driver) {
            this.selectedMarkers.driver = this._makeDriverMarker(ride);
        }

        const marker = this.selectedMarkers.driver;
        const from = marker.getLngLat();
        const to = { lng: ride.driverPos.lng, lat: ride.driverPos.lat };
        marker.setRotation(computeBearing(from, to));

        const token = (this.animTokens.get(rideId) ?? 0) + 1;
        this.animTokens.set(rideId, token);

        const durationMs = 3500;
        const start = performance.now();
        const animate = (now) => {
            if (this.animTokens.get(rideId) !== token) return;
            const t = Math.min((now - start) / durationMs, 1);
            const lng = from.lng + (to.lng - from.lng) * t;
            const lat = from.lat + (to.lat - from.lat) * t;
            marker.setLngLat([lng, lat]);
            if (t < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);

        const trail = this.trails.get(rideId) ?? [];
        trail.push([to.lng, to.lat]);
        if (trail.length > 20) trail.shift();
        this.trails.set(rideId, trail);
        this._updateTrailLayer(rideId);
    }

    _updateTrailLayer(rideId) {
        if (!this.map.getSource('driver-trail')) return;
        const isSelected = rideId === store.selectedRideId;
        const coords = isSelected ? (this.trails.get(rideId) ?? []) : [];
        this.map.getSource('driver-trail').setData({
            type: 'FeatureCollection',
            features: coords.length >= 2 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }] : [],
        });
    }

    /** The animated dashed line from the driver's current position to wherever they're currently heading. */
    _updateRouteAhead() {
        if (!this.map.getSource('route-ahead')) return;
        const ride = store.getSelected();
        const empty = { type: 'FeatureCollection', features: [] };

        if (!ride || !ride.driverPos) {
            this.map.getSource('route-ahead').setData(empty);
            return;
        }
        const target = ride.seen.has('RIDE_STARTED') ? ride.dropoff : ride.pickup;
        if (!target) {
            this.map.getSource('route-ahead').setData(empty);
            return;
        }

        this.map.getSource('route-ahead').setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: [[ride.driverPos.lng, ride.driverPos.lat], [target.lng, target.lat]] },
            }],
        });
    }

    _renderCityDots() {
        const rides = store.allRidesNewestFirst();
        const activeIds = new Set(rides.filter((r) => r.id !== store.selectedRideId && !r.failed && r.status !== 'RIDE_COMPLETED').map((r) => r.id));

        for (const [rideId, marker] of this.cityDots) {
            if (!activeIds.has(rideId)) { marker.remove(); this.cityDots.delete(rideId); }
        }

        for (const ride of rides) {
            if (!activeIds.has(ride.id)) continue;
            const pos = ride.driverPos ?? ride.pickup;
            if (!pos) continue;

            let marker = this.cityDots.get(ride.id);
            if (!marker) {
                const el = makeDotEl('#9CA0B8', 10);
                el.style.cursor = 'pointer';
                el.addEventListener('click', (evt) => { evt.stopPropagation(); store.select(ride.id); });
                marker = new maplibregl.Marker({ element: el }).setLngLat([pos.lng, pos.lat]).addTo(this.map);
                this.cityDots.set(ride.id, marker);
            } else {
                marker.setLngLat([pos.lng, pos.lat]);
            }
        }
    }
}

function computeBearing(from, to) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const lat1 = toRad(from.lat), lat2 = toRad(to.lat);
    const dLng = toRad(to.lng - from.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export const mapController = new MapController();

export async function initMapRenderer(config) {
    await mapController.init(config);
}
