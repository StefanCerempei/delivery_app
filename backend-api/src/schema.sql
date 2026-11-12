-- Schema bazei de date Reloq (MySQL / MariaDB).
-- Serverul o aplică automat la pornire (CREATE TABLE IF NOT EXISTS),
-- deci nu e nevoie să o rulezi manual. O poți rula și din phpMyAdmin.

CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(120) NOT NULL,
    phone         VARCHAR(32)  NULL,
    role          ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
    age_confirmed_at DATETIME NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
    id                       CHAR(36)     NOT NULL,
    code                     VARCHAR(16)  NOT NULL,
    user_id                  INT UNSIGNED NOT NULL,
    status                   ENUM('pending_payment', 'paid', 'en_route', 'completed', 'cancelled')
                             NOT NULL DEFAULT 'pending_payment',

    pickup_address           VARCHAR(500) NOT NULL,
    pickup_lat               DECIMAL(9, 6) NOT NULL,
    pickup_lng               DECIMAL(9, 6) NOT NULL,
    dropoff_address          VARCHAR(500) NOT NULL,
    dropoff_lat              DECIMAL(9, 6) NOT NULL,
    dropoff_lng              DECIMAL(9, 6) NOT NULL,
    distance_miles           DECIMAL(8, 1) NOT NULL,
    duration_mins            INT UNSIGNED NOT NULL,

    vehicle                  VARCHAR(20)  NOT NULL,
    schedule_type            ENUM('asap', 'scheduled') NOT NULL,
    scheduled_for            DATETIME     NULL,
    schedule_label           VARCHAR(120) NOT NULL,

    items_description        TEXT         NOT NULL,
    photos_count             TINYINT UNSIGNED NOT NULL DEFAULT 0,

    base_fare_cents          INT UNSIGNED NOT NULL,
    distance_cost_cents      INT UNSIGNED NOT NULL,
    time_cost_cents          INT UNSIGNED NOT NULL,
    total_cents              INT UNSIGNED NOT NULL,
    currency                 CHAR(3)      NOT NULL,

    stripe_payment_intent_id VARCHAR(255) NULL,
    card_last4               CHAR(4)      NULL,

    created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_orders_code (code),
    KEY idx_orders_user (user_id),
    KEY idx_orders_status_created (status, created_at),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
