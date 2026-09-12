package com.tapride.matching.api.dto;

import com.tapride.matching.domain.DriverLocationIndex;

import java.util.UUID;

public record AvailableDriverDTO(
        UUID driverId,
        double lat,
        double lng
) {
    public static AvailableDriverDTO from(DriverLocationIndex.AvailableDriverLocation location) {
        return new AvailableDriverDTO(location.driverId(), location.lat(), location.lng());
    }
}
