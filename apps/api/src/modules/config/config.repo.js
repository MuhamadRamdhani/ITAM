export async function listAssetTypes(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT code, display_name AS label
    FROM public.asset_types
    WHERE tenant_id = $1
    ORDER BY id ASC
    `,
    [tenantId]
  );
  return rows;
}

export async function listLifecycleStates(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT code, display_name AS label
    FROM public.lifecycle_states
    WHERE tenant_id = $1
    ORDER BY id ASC
    `,
    [tenantId]
  );
  return rows;
}

function makeConfigError(code, message, details) {
  const err = new Error(message);
  err.code = code; 
  err.statusCode = 500; 
  err.details = details;
  return err;
}

function toInt(n) {
  const x = typeof n === "string" ? Number(n) : Number(n);
  return Number.isFinite(x) ? x : NaN;
}

export async function getUiConfig(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT setting_key, value_json
    FROM public.tenant_settings
    WHERE tenant_id = $1
      AND setting_key IN ('ui.page_size.options', 'ui.documents.page_size.default')
    `,
    [tenantId]
  );

  const map = new Map(rows.map((r) => [r.setting_key, r.value_json]));

  const optionsRaw = map.get("ui.page_size.options");
  const defaultRaw = map.get("ui.documents.page_size.default");

  if (optionsRaw == null || defaultRaw == null) {
    throw makeConfigError(
      "CONFIG_MISSING",
      "UI config is missing. Please run seed/migration for tenant_settings.",
      {
        tenant_id: tenantId,
        missing_keys: [
          ...(optionsRaw == null ? ["ui.page_size.options"] : []),
          ...(defaultRaw == null ? ["ui.documents.page_size.default"] : []),
        ],
      }
    );
  }

  if (!Array.isArray(optionsRaw) || optionsRaw.length === 0) {
    throw makeConfigError("CONFIG_INVALID", "ui.page_size.options must be a non-empty array", {
      tenant_id: tenantId,
      value: optionsRaw,
    });
  }

  const page_size_options = optionsRaw
    .map(toInt)
    .filter((x) => Number.isFinite(x) && x > 0);

  if (page_size_options.length !== optionsRaw.length) {
    throw makeConfigError("CONFIG_INVALID", "ui.page_size.options contains invalid values", {
      tenant_id: tenantId,
      value: optionsRaw,
    });
  }

  // validate default is a number and included in options
  const documents_page_size_default = toInt(defaultRaw);
  if (!Number.isFinite(documents_page_size_default) || documents_page_size_default <= 0) {
    throw makeConfigError("CONFIG_INVALID", "ui.documents.page_size.default must be a positive number", {
      tenant_id: tenantId,
      value: defaultRaw,
    });
  }

  if (!page_size_options.includes(documents_page_size_default)) {
    throw makeConfigError(
      "CONFIG_INVALID",
      "ui.documents.page_size.default must be one of ui.page_size.options",
      {
        tenant_id: tenantId,
        default: documents_page_size_default,
        options: page_size_options,
      }
    );
  }

  // normalized output
  return {
    page_size_options: [...page_size_options].sort((a, b) => a - b),
    documents_page_size_default,
  };
}