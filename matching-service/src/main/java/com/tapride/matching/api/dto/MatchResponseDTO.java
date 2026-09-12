package com.tapride.matching.api.dto;

import com.tapride.matching.domain.Driver;
import com.tapride.matching.domain.DriverMatch;
import com.tapride.matching.domain.MatchStatus;

import java.time.Instant;
import java.util.UUID;

public record MatchResponseDTO(
        UUID id,
        UUID rideId,
        UUID driverId,
        String driverName,
        String driverVehicle,
        MatchStatus status,
        double pickupLat,
        double pickupLng,
        double dropoffLat,
        double dropoffLng,
        double currentLat,
        double currentLng,
        Instant createdAt,
        Instant updatedAt
) {
    /**
     * driver is nullable - callers that only have the match (not a resolved
     * Driver row, e.g. if the driver was somehow deleted) still get a valid
     * DTO with null name/vehicle rather than failing the whole lookup.
     */
    public static MatchResponseDTO from(DriverMatch match, Driver driver) {
        return new MatchResponseDTO(
                match.getId(), match.getRideId(), match.getDriverId(),
                driver != null ? driver.getName() : null,
                driver != null ? driver.getVehicle() : null,
                match.getStatus(),
                match.getPickupLat(), match.getPickupLng(), match.getDropoffLat(), match.getDropoffLng(),
                match.getCurrentLat(), match.getCurrentLng(),
                match.getCreatedAt(), match.getUpdatedAt());
    }
}
