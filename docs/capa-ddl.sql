-- CAPA workflow tables
-- Apply this DDL to the same PostgreSQL database used by the API.

CREATE TABLE IF NOT EXISTS public.capa_cases (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  capa_code TEXT NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id BIGINT NULL,
  source_label TEXT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',
  owner_identity_id BIGINT NULL,
  due_date DATE NULL,
  nonconformity_summary TEXT NULL,
  root_cause_summary TEXT NULL,
  corrective_action_summary TEXT NULL,
  preventive_action_summary TEXT NULL,
  verification_summary TEXT NULL,
  closure_notes TEXT NULL,
  notes TEXT NULL,
  opened_at TIMESTAMPTZ NULL,
  root_caused_at TIMESTAMPTZ NULL,
  corrective_action_at TIMESTAMPTZ NULL,
  preventive_action_at TIMESTAMPTZ NULL,
  verified_at TIMESTAMPTZ NULL,
  closed_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS capa_cases_tenant_code_uidx
  ON public.capa_cases (tenant_id, capa_code);

CREATE INDEX IF NOT EXISTS capa_cases_tenant_status_idx
  ON public.capa_cases (tenant_id, status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS capa_cases_tenant_owner_idx
  ON public.capa_cases (tenant_id, owner_identity_id, due_date);

CREATE INDEX IF NOT EXISTS capa_cases_tenant_source_idx
  ON public.capa_cases (tenant_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS capa_cases_tenant_overdue_idx
  ON public.capa_cases (tenant_id, status, due_date);
