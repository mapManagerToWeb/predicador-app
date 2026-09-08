package com.predicador.reporting.repository;

import com.predicador.reporting.model.WhatsAppDelivery;
import com.predicador.reporting.model.WhatsAppDeliveryStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import org.springframework.transaction.annotation.Transactional;

public interface WhatsAppDeliveryRepository extends JpaRepository<WhatsAppDelivery, String> {
    @Modifying
    @Transactional
    @Query("update WhatsAppDelivery d set d.leaseUntil = :leaseUntil "
            + "where d.idempotencyKey = :key and d.status = :status and d.leaseUntil < :now")
    int claimStale(@Param("key") String key, @Param("status") WhatsAppDeliveryStatus status,
                   @Param("now") Instant now, @Param("leaseUntil") Instant leaseUntil);
}
