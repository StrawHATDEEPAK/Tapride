/**
 * Polls each backend service's own /actuator/health endpoint directly (NOT
 * through notification-service's WebSocket relay - this is a genuinely
 * separate concern, since a service could be down in a way that also breaks
 * its Kafka connection, meaning the WebSocket feed wouldn't tell you anything
 * useful about ITS OWN health, only about events it never got to publish).
 *
 * Each service already exposes real Spring Boot Actuator health data (DB
 * connectivity, disk space, etc - the same endpoint used by every Dockerfile
 * HEALTHCHECK and k8s readinessProbe throughout this project) - this panel
 * is just a browser-facing view of information the backend already produces.
 */

const POLL_INTERVAL_MS = 10000;

function servicesToCheck(config) {
    return [
        { name: 'order-service', url: `${config.API.ORDER}/actuator/health` },
        { name: 'payment-service', url: `${config.API.PAYMENT}/actuator/health` },
        { name: 'matching-service', url: `${config.API.MATCHING}/actuator/health` },
        // NOTIFICATION_WS is a full ws-endpoint URL (e.g. http://host/ws) -
        // strip that suffix to get the service's own base URL for a plain
        // HTTP health check instead of a WebSocket connection.
        { name: 'notification-service', url: `${config.API.NOTIFICATION_WS.replace(/\/ws$/, '')}/actuator/health` },
    ];
}

async function checkOne(service) {
    const start = performance.now();
    try {
        const res = await fetch(service.url, { signal: AbortSignal.timeout(5000) });
        const elapsedMs = Math.round(performance.now() - start);
        if (!res.ok) return { ...service, status: 'DOWN', elapsedMs };
        const body = await res.json();
        return { ...service, status: body.status ?? 'UNKNOWN', elapsedMs };
    } catch {
        return { ...service, status: 'UNREACHABLE', elapsedMs: null };
    }
}

function badgeClass(status) {
    if (status === 'UP') return 'badge--done';
    if (status === 'DOWN' || status === 'UNREACHABLE') return 'badge--failed';
    return 'badge--pending';
}

export function initServerHealth(config) {
    const container = document.getElementById('server-health-panel');
    if (!container) return;

    const services = servicesToCheck(config);

    async function pollAndRender() {
        const results = await Promise.all(services.map(checkOne));

        container.innerHTML = results.map((r) => `
            <div class="health-row">
                <span class="health-name">${r.name}</span>
                <span class="badge ${badgeClass(r.status)}">${r.status}</span>
                <span class="health-latency text-faint mono">${r.elapsedMs != null ? r.elapsedMs + 'ms' : '—'}</span>
            </div>
        `).join('');
    }

    pollAndRender();
    setInterval(pollAndRender, POLL_INTERVAL_MS);
}
