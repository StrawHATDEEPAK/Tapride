import { store, haversine } from './state.js';

const STOPS = [
    { label: 'Requested', done: 'RIDE_REQUESTED' },
    { label: 'Validated', done: 'RIDE_VALIDATED', fail: 'RIDE_VALIDATION_FAILED' },
    { label: 'Payment authorized', done: 'PAYMENT_AUTHORIZED', fail: 'PAYMENT_FAILED' },
    { label: 'Driver matched', done: 'DRIVER_MATCHED', fail: 'DRIVER_MATCH_FAILED' },
    { label: 'Trip in progress', done: 'RIDE_STARTED' },
    { label: 'Completed', done: 'RIDE_COMPLETED' },
];

// Matches matching-service's DriverLocationSimulator constants exactly
// (STEP_FRACTION, tick interval, arrival threshold) - see that class - so
// the ETA estimate reflects the ACTUAL simulated decay curve, not a generic
// assumed speed. If those constants change on the backend, update here too.
const SIM_STEP_FRACTION = 0.15;
const SIM_TICK_SECONDS = 4;
const SIM_ARRIVAL_THRESHOLD_KM = 0.111; // ~0.001 degrees at the equator

function stopState(ride, stop) {
    if (stop.fail && ride.seen.has(stop.fail)) return 'failed';
    if (ride.seen.has(stop.done)) return 'done';
    return 'pending';
}

function formatTime(iso) {
    if (!iso) return '';
    // Java's Instant.toString() can emit nanosecond precision - JS Date only
    // reliably parses millisecond precision; trim before parsing.
    const trimmed = iso.replace(/(\.\d{3})\d*(Z|[+-]\d{2}:?\d{2})?$/, '$1$2');
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Returns { percent, etaSeconds } for the CURRENT leg, or null if there's nothing to show yet. */
function computeProgress(ride) {
    if (!ride.driverPos || ride.legStartDistance == null) return null;

    const target = ride.seen.has('RIDE_STARTED') ? ride.dropoff : ride.pickup;
    if (!target) return null;

    const currentDistance = haversine(ride.driverPos, target);
    const percent = Math.max(0, Math.min(100, Math.round((1 - currentDistance / ride.legStartDistance) * 100)));

    let etaSeconds = 0;
    if (currentDistance > SIM_ARRIVAL_THRESHOLD_KM) {
        const ticksRemaining = Math.log(SIM_ARRIVAL_THRESHOLD_KM / currentDistance) / Math.log(1 - SIM_STEP_FRACTION);
        etaSeconds = Math.max(0, Math.ceil(ticksRemaining)) * SIM_TICK_SECONDS;
    }

    return { percent, etaSeconds };
}

function formatEta(seconds) {
    if (seconds <= 0) return 'Arriving now';
    if (seconds < 60) return `~${seconds}s away`;
    return `~${Math.round(seconds / 60)} min away`;
}

export function initDetailRenderer() {
    const container = document.getElementById('ride-detail');

    function render() {
        const ride = store.getSelected();
        if (!ride) {
            container.innerHTML = '<p class="empty-state">Select a ride from the list to see its saga unfold here.</p>';
            return;
        }

        const states = STOPS.map((stop) => stopState(ride, stop));
        let activeIndex = -1;
        if (!ride.failed) activeIndex = states.findIndex((s) => s === 'pending');

        const ladderHtml = STOPS.map((stop, i) => {
            let cls;
            if (i === activeIndex) cls = 'is-active';
            else if (states[i] === 'done') cls = 'is-done';
            else if (states[i] === 'failed') cls = 'is-failed';
            else cls = 'is-pending';

            const eventRecord = ride.history.find((h) => h.eventType === stop.done || h.eventType === stop.fail);

            return `
                <div class="ladder-stop ${cls}">
                    <div class="ladder-dot"></div>
                    <div>
                        <div class="ladder-label">${stop.label}${cls === 'is-failed' ? ' — failed' : ''}</div>
                        ${eventRecord ? `<div class="ladder-time">${formatTime(eventRecord.occurredAt)}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        const progress = !ride.failed && ride.status !== 'RIDE_COMPLETED' ? computeProgress(ride) : null;
        const progressHtml = progress ? `
            <div class="progress-block">
                <div class="progress-header">
                    <span>${ride.seen.has('RIDE_STARTED') ? 'En route to dropoff' : 'Driver en route to pickup'}</span>
                    <span class="mono text-dim">${formatEta(progress.etaSeconds)}</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: ${progress.percent}%;"></div>
                </div>
            </div>
        ` : '';

        container.innerHTML = `
            <div class="card mono" style="font-size: var(--text-xs); margin-bottom: var(--space-4);">
                <div class="text-dim">Ride ID</div>
                <div>${ride.id}</div>
                ${ride.driverId ? `<div class="text-dim" style="margin-top: var(--space-2);">Driver ID</div><div>${ride.driverId}</div>` : ''}
                ${ride.failed ? `<div class="text-dim" style="margin-top: var(--space-2);">Reason</div><div style="color: var(--color-coral);">${ride.failReason}</div>` : ''}
            </div>
            ${progressHtml}
            <div class="status-ladder">${ladderHtml}</div>
        `;
    }

    store.addEventListener('change', render);
    store.addEventListener('select', render);
    store.addEventListener('position', () => {
        // Only re-render for position ticks on the CURRENTLY selected ride -
        // otherwise every ride's location tick would repaint this panel
        // even when looking at a different ride entirely.
        render();
    });
    render();
}
