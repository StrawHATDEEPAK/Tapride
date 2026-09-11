package com.tapride.matching.api;

import com.tapride.matching.api.dto.AvailableDriverDTO;
import com.tapride.matching.api.dto.MatchResponseDTO;
import com.tapride.matching.domain.Driver;
import com.tapride.matching.domain.DriverLocationIndex;
import com.tapride.matching.domain.DriverMatch;
import com.tapride.matching.domain.MatchingService;
import com.tapride.matching.repository.DriverRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/matches")
@RequiredArgsConstructor
public class MatchController {

    private final MatchingService matchingService;
    private final DriverLocationIndex driverLocationIndex;
    private final DriverRepository driverRepository;

    @GetMapping("/by-ride/{rideId}")
    public ResponseEntity<MatchResponseDTO> getByRideId(@PathVariable UUID rideId) {
        DriverMatch match = matchingService.getByRideId(rideId);
        // Resolved here (API/shaping layer) rather than inside MatchingService,
        // which stays focused on saga/domain logic - name+vehicle are purely
        // presentational, used only by the frontend's driver info card.
        Driver driver = driverRepository.findById(match.getDriverId()).orElse(null);
        return ResponseEntity.ok(MatchResponseDTO.from(match, driver));
    }

    /**
     * Read-only, no ride association at all - purely "here's who's nearby
     * right now," shown on the map BEFORE anyone books, so a visitor can see
     * the driver fleet is real rather than trusting an empty map on faith.
     */
    @GetMapping("/drivers/available")
    public ResponseEntity<List<AvailableDriverDTO>> getAvailableDrivers() {
        List<AvailableDriverDTO> drivers = driverLocationIndex.listAvailableDrivers().stream()
                .map(AvailableDriverDTO::from)
                .toList();
        return ResponseEntity.ok(drivers);
    }
}
