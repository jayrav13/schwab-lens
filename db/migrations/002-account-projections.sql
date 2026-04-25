-- Phase 2: per-account projection inputs.
-- See spec: docs/superpowers/specs/2026-04-24-phase2-per-account-projections-design.md

ALTER TABLE accounts ADD COLUMN expected_real_return REAL;

ALTER TABLE accounts ADD COLUMN target_value REAL;

ALTER TABLE accounts ADD COLUMN account_group TEXT;
