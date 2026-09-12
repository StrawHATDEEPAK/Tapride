package com.tapride.matching.domain;

import org.springframework.data.geo.*;
import org.springframework.data.redis.connection.RedisGeoCommands;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.GeoOperations;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Thin wrapper around Redis's GEO commands (GEOADD/GEOSEARCH), which is what
 * actually makes this "geospatial matching" rather than "loop over every
 * driver and compute distance in Java". Redis maintains the drivers as points
 * on a geohash-indexed sorted set, so "find nearest available driver within
 * radius" is a single O(log N) native command instead of an application-level
 * table scan.
 *
 * Two separate Redis keys:
 *   - "drivers:available" (GEO set)  - only drivers currently free to be matched
 *   - "drivers:location"  (GEO set)  - EVERY driver's current position, used by
 *     the simulator to know where a busy driver physically is, regardless of
 *     availability
 * Splitting these means "find an available driver nearby" never accidentally
 * matches a driver who's already on a trip.
 */
@Component
public class DriverLocationIndex {

    private static final String AVAILABLE_KEY = "drivers:available";
    private static final String LOCATION_KEY = "drivers:location";

    private final GeoOperations<String, String> geoOps;
    private final StringRedisTemplate redisTemplate;

    public DriverLocationIndex(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
        this.geoOps = redisTemplate.opsForGeo();
    }

    /** Called at startup (seeding) and whenever a driver becomes free again. */
    public void markAvailable(UUID driverId, double lat, double lng) {
        geoOps.add(AVAILABLE_KEY, new Point(lng, lat), driverId.toString());
        geoOps.add(LOCATION_KEY, new Point(lng, lat), driverId.toString());
    }

    /** Removes the driver from the searchable "available" pool without losing their location entry. */
    public void markBusy(UUID driverId) {
        geoOps.remove(AVAILABLE_KEY, driverId.toString());
    }

    /** Keeps the location index (not the availability index) current as the simulator ticks a driver's position. */
    public void updateLocation(UUID driverId, double lat, double lng) {
        geoOps.add(LOCATION_KEY, new Point(lng, lat), driverId.toString());
    }

    /**
     * The actual matching query: nearest AVAILABLE driver within radiusKm of
     * the pickup point. Returns empty if none found within range - the caller
     * decides what "no drivers nearby" means for the saga (MATCH_FAILED).
     */
    public Optional<UUID> findNearestAvailableDriver(double lat, double lng, double radiusKm) {
        Circle searchArea = new Circle(new Point(lng, lat), new Distance(radiusKm, Metrics.KILOMETERS));
        GeoResults<RedisGeoCommands.GeoLocation<String>> results = geoOps.radius(
                AVAILABLE_KEY, searchArea,
                RedisGeoCommands.GeoRadiusCommandArgs.newGeoRadiusArgs().sortAscending().limit(1));

        if (results == null || results.getContent().isEmpty()) {
            return Optional.empty();
        }
        String nearestDriverId = results.getContent().get(0).getContent().getName();
        return Optional.of(UUID.fromString(nearestDriverId));
    }

    public Optional<Point> getLocation(UUID driverId) {
        List<Point> points = geoOps.position(LOCATION_KEY, driverId.toString());
        if (points == null || points.isEmpty() || points.get(0) == null) {
            return Optional.empty();
        }
        return Optional.of(points.get(0));
    }

    /**
     * Every currently-available driver's position - used by the frontend to
     * show "drivers near you" on the map BEFORE a ride is even booked, so a
     * visitor can see the fleet is real and nearby, not just trust that it exists.
     *
     * Redis GEO sets are implemented as sorted sets scored by geohash - there's
     * no single native "give me every member with its position" GEO command,
     * so this is a two-step fetch: list all member IDs via the underlying
     * ZSET, then batch-resolve their positions via GEOPOS (geoOps.position
     * accepts multiple members in one call, avoiding N round trips).
     */
    public List<AvailableDriverLocation> listAvailableDrivers() {
        Set<String> driverIds = redisTemplate.opsForZSet().range(AVAILABLE_KEY, 0, -1);
        if (driverIds == null || driverIds.isEmpty()) {
            return List.of();
        }

        List<Point> positions = geoOps.position(AVAILABLE_KEY, driverIds.toArray(new String[0]));
        List<AvailableDriverLocation> result = new ArrayList<>();
        int i = 0;
        for (String driverId : driverIds) {
            Point p = (positions != null && i < positions.size()) ? positions.get(i) : null;
            if (p != null) {
                result.add(new AvailableDriverLocation(UUID.fromString(driverId), p.getY(), p.getX()));
            }
            i++;
        }
        return result;
    }

    public record AvailableDriverLocation(UUID driverId, double lat, double lng) {
    }
}
