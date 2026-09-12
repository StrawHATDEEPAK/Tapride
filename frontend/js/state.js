/**
 * Single client-side store. Every normalized WebSocket event flows through
 * applyEvent(); every renderer (feed list, status ladder, map) subscribes to
 * this instead of talking to the WebSocket directly.
 */

const FAILURE_EVENTS = new Set([
    'RIDE_VALIDATION_FAILED', 'PAYMENT_FAILED', 'DRIVER_MATCH_FAILED', 'RIDE_CANCELLED',
]);

class RideStore extends EventTarget {
    constructor() {
        super();
        /** @type {Map<string, object>} */
        this.rides = new Map();
        this.selectedRideId = null;
    }

    applyEvent(event) {
        const { service, rideId, eventType, payload } = event;

        if (eventType === 'DRIVER_LOCATION_UPDATED') {
            const ride = this.rides.get(rideId);
            if (ride) {
                ride.driverPos = { lat: payload.lat, lng: payload.lng };
                ride.driverId = payload.driverId ?? ride.driverId;
                this.dispatchEvent(new CustomEvent('position', { detail: { rideId } }));
            }
            return;
        }

        if (service !== 'order-service') return;

        let ride = this.rides.get(rideId);
        if (!ride) {
            const currentlySelected = this.selectedRideId ? this.rides.get(this.selectedRideId) : null;
            const previousRideIsDone = currentlySelected && (currentlySelected.status === 'RIDE_COMPLETED' || currentlySelected.failed);
            if (this.selectedRideId === null || previousRideIsDone) {
                this.selectedRideId = rideId;
            }

            ride = {
                id: rideId,
                pickup: { lat: payload.pickupLat, lng: payload.pickupLng },
                dropoff: { lat: payload.dropoffLat, lng: payload.dropoffLng },
                fare: null,
                driverId: null,
                driverPos: null,
                status: eventType,
                failed: false,
                failReason: null,
                seen: new Set(),
                history: [],
                createdAt: event.occurredAt,
                // Baseline distance for the current leg, captured once when a
                // leg begins - render-detail.js diffs current distance against
                // this to compute the progress-bar percentage. Set below, at
                // the moment DRIVER_MATCHED / RIDE_STARTED first appear.
                legStartDistance: null,
            };
            this.rides.set(rideId, ride);
        }

        const wasStarted = ride.seen.has('RIDE_STARTED');

        ride.seen.add(eventType);
        ride.status = eventType;
        ride.history.push({ eventType, occurredAt: event.occurredAt, payload });

        if (payload.estimatedFare != null) ride.fare = payload.estimatedFare;
        if (payload.driverId != null) ride.driverId = payload.driverId;
        if (FAILURE_EVENTS.has(eventType)) {
            ride.failed = true;
            ride.failReason = payload.reason ?? eventType;
        }

        // Leg 1 baseline: distance from wherever the driver starts to pickup -
        // captured the instant we're matched, using whatever position we have.
        if (eventType === 'DRIVER_MATCHED' && ride.driverPos) {
            ride.legStartDistance = haversine(ride.driverPos, ride.pickup);
        }
        // Leg 2 baseline: distance from pickup to dropoff, captured when the
        // trip actually starts (driver has just arrived at pickup).
        if (eventType === 'RIDE_STARTED') {
            ride.legStartDistance = haversine(ride.pickup, ride.dropoff);
        }

        if (this.selectedRideId === null) this.selectedRideId = rideId;

        this.dispatchEvent(new CustomEvent('change', { detail: { rideId } }));

        // Fired ONLY on the transition into RIDE_STARTED (not on every event
        // for an already-started ride) - this is what render-map.js listens
        // for to trigger the arrival-bounce animation exactly once.
        if (!wasStarted && eventType === 'RIDE_STARTED') {
            this.dispatchEvent(new CustomEvent('ride-started', { detail: { rideId } }));
        }
    }

    select(rideId) {
        this.selectedRideId = rideId;
        this.dispatchEvent(new CustomEvent('select', { detail: { rideId } }));
    }

    getSelected() {
        return this.selectedRideId ? this.rides.get(this.selectedRideId) : null;
    }

    allRidesNewestFirst() {
        return [...this.rides.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
}

/** Straight-line distance in km - same simplification the backend simulator itself uses. */
function haversine(a, b) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export const store = new RideStore();
export { haversine };
