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
    email_verified_at DATETIME NULL,
    password_changed_at DATETIME NULL,
    session_version INT UNSIGNED NOT NULL DEFAULT 0,
    deleted_at    DATETIME NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
    id                       CHAR(36)     NOT NULL,
    code                     VARCHAR(16)  NOT NULL,
    user_id                  INT UNSIGNED NOT NULL,
    status                   ENUM('pending_payment', 'confirmed', 'paid', 'en_route', 'completed', 'cancelled')
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
    -- 1 = model vechi (bază + distanță + timp); 2 = specificația RELOQ: base_fare = Service fee,
    -- distance_cost = Transportation, time_cost = Reservation fee (+ manopera facturată după job)
    pricing_version          TINYINT UNSIGNED NOT NULL DEFAULT 1,
    outbound_mins            INT UNSIGNED NULL,
    return_mins              INT UNSIGNED NULL,
    labor_cents_per_min      INT UNSIGNED NULL,

    stripe_payment_intent_id VARCHAR(255) NULL,
    card_last4               CHAR(4)      NULL,
    paid_at                  DATETIME     NULL,
    payment_method           VARCHAR(20)  NULL,
    paypal_order_id          VARCHAR(64)  NULL,
    paypal_capture_id        VARCHAR(64)  NULL,

    created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_orders_code (code),
    KEY idx_orders_user (user_id),
    KEY idx_orders_status_created (status, created_at),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Coduri unice (6 cifre) pentru verificarea emailului. Un singur cod activ per cont; codul e salvat doar ca hash.
CREATE TABLE IF NOT EXISTS email_verifications (
    user_id      INT UNSIGNED NOT NULL,
    code_hash    CHAR(64)     NOT NULL,
    expires_at   DATETIME     NOT NULL,
    attempts     TINYINT UNSIGNED NOT NULL DEFAULT 0,
    sent_at      DATETIME     NOT NULL,
    sends_window_start DATETIME NOT NULL,
    sends_count  TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_email_verifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Linkuri de resetare a parolei. Un singur link activ per cont; tokenul e salvat doar ca hash.
CREATE TABLE IF NOT EXISTS password_resets (
    user_id     INT UNSIGNED NOT NULL,
    token_hash  CHAR(64)     NOT NULL,
    expires_at  DATETIME     NOT NULL,
    created_at  DATETIME     NOT NULL,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_password_resets_token (token_hash),
    CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Șoferi / angajați. Dispecerul alege șoferul la confirmarea comenzii; șoferul primește emailul cu jobul.
-- „active = 0” = arhivat (nu mai apare la alegere, dar rămâne pe comenzile vechi).
CREATE TABLE IF NOT EXISTS drivers (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    full_name   VARCHAR(120) NOT NULL,
    email       VARCHAR(255) NOT NULL,
    phone       VARCHAR(32)  NULL,
    notes       VARCHAR(500) NULL,
    active      TINYINT(1)   NOT NULL DEFAULT 1,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_drivers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reamintirile trimise șoferilor (un email pe șofer pe zi, chiar dacă cron-ul rulează de mai multe ori).
CREATE TABLE IF NOT EXISTS driver_reminders (
    driver_id   INT UNSIGNED NOT NULL,
    job_date    DATE         NOT NULL,
    sent_at     DATETIME     NOT NULL,
    PRIMARY KEY (driver_id, job_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pozele obiectelor încărcate de client (comprimate în browser, ~200–600 KB fiecare).
-- Stau în baza de date ca să nu se piardă la redeploy (fișierele aplicației se rescriu).
CREATE TABLE IF NOT EXISTS order_photos (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id    CHAR(36)     NOT NULL,
    mime        VARCHAR(20)  NOT NULL,
    size_bytes  INT UNSIGNED NOT NULL,
    data        MEDIUMBLOB   NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_order_photos_order (order_id),
    CONSTRAINT fk_order_photos_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Linkuri de autentificare pentru șoferi (fără parolă). Doar hash-ul tokenului e salvat; un link merge o singură dată.
CREATE TABLE IF NOT EXISTS driver_login_tokens (
    token_hash  CHAR(64)     NOT NULL,
    driver_id   INT UNSIGNED NOT NULL,
    expires_at  DATETIME     NOT NULL,
    used_at     DATETIME     NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (token_hash),
    KEY idx_driver_login_tokens_driver (driver_id),
    CONSTRAINT fk_driver_login_tokens_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Setări ale aplicației, modificabile din dispecerat (ex. trimiterea automată a cererilor de plată pentru manoperă).
CREATE TABLE IF NOT EXISTS app_settings (
    name        VARCHAR(64)  NOT NULL,
    value       VARCHAR(255) NOT NULL,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ore / zile blocate de dispecer (nu se mai pot rezerva). slot = '07:00' … '15:00' sau '*' pentru toată ziua.
CREATE TABLE IF NOT EXISTS blocked_slots (
    day         DATE         NOT NULL,
    slot        VARCHAR(5)   NOT NULL,
    reason      VARCHAR(120) NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (day, slot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
