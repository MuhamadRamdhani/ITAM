$ErrorActionPreference = 'Stop'

function Get-Steps {
  param(
    [string]$Type,
    [string]$Route,
    [string]$Noun,
    [string]$Detail
  )

  switch ($Type) {
    'Login' {
      @('Open the login page.', 'Enter valid tenant credentials.', 'Submit the form.', 'Verify redirect to home and session badge render.')
    }
    'NegativeLogin' {
      @('Open the login page.', 'Enter invalid credentials.', 'Submit the form.', 'Verify the error message and no session creation.')
    }
    'Dashboard' {
      @('Open the home dashboard.', 'Review summary cards and launcher blocks.', 'Check role-based visibility.', 'Click a launcher and verify navigation.')
    }
    'Logout' {
      @('Open the application shell.', 'Click logout.', 'Wait for redirect to login.', 'Verify protected pages are blocked until login.')
    }
    'List' {
      @("Open $Route.", "Use search/filter controls for $Detail.", 'Apply the filter or search.', 'Verify rows, counts, and pagination update correctly.')
    }
    'Create' {
      @("Open $Route.", "Click New $Noun.", "Fill the required fields for $Detail and save.", 'Verify the record is created and visible in the list or detail page.')
    }
    'Update' {
      @("Open $Route.", "Open an existing $Noun record.", "Edit the fields covered by $Detail and save.", 'Verify the updated values persist after refresh.')
    }
    'Workflow' {
      @("Open the $Noun detail page under $Route.", "Execute the workflow action for $Detail.", 'Confirm the prompt or modal and submit the transition.', 'Verify status, timestamps, and audit trail updates.')
    }
    'Relation' {
      @("Open the $Noun detail page under $Route.", "Use the relation panel for $Detail.", 'Add or remove the related record and save.', 'Verify relation counters and linked records refresh correctly.')
    }
    'Decision' {
      @("Open the decision panel under $Route.", "Select the decision flow for $Detail.", 'Enter the decision note and submit approve or reject.', 'Verify the decision status and audit trail update.')
    }
    'Upload' {
      @("Open the upload flow under $Route.", "Select a file for $Detail.", 'Submit the upload request.', 'Verify the file is stored, listed, and downloadable or validation is shown for invalid input.')
    }
    'Export' {
      @("Open the page under $Route.", "Set the filters for $Detail.", 'Click the export button or download link.', 'Verify the file downloads in the expected format and content.')
    }
    'ReadOnly' {
      @("Open the page under $Route.", "Try the restricted action for $Detail.", 'Observe the access control message or disabled control.', 'Verify no data change occurs and the page remains read-only.')
    }
    'Scorecard' {
      @('Open the KPI scorecard page.', "Change the period or filter for $Detail.", 'Review the summary, trend, and status cards.', 'Verify the displayed values refresh consistently for the selected period.')
    }
    'Members' {
      @("Open the $Noun detail page under $Route.", "Go to the member or checklist section for $Detail.", 'Add or remove the related item and save.', 'Verify the roster or checklist list refreshes and the counters update.')
    }
    'Finding' {
      @("Open the $Noun detail page under $Route.", "Open the findings area for $Detail.", 'Create or close the finding and save the notes.', 'Verify the finding list and status change are reflected in the UI.')
    }
    default {
      @("Open $Route.", "Execute the action for $Detail.", 'Save or confirm the change.', 'Verify the UI and data reflect the new state.')
    }
  }
}

function Add-Scenario {
  param(
    [System.Collections.Generic.List[object]]$Rows,
    [string]$TcId,
    [string]$Module,
    [string]$Feature,
    [string]$FunctionText,
    [string]$Scenario,
    [string]$Type,
    [string]$Role,
    [string]$Priority,
    [string]$Route,
    [string]$Noun,
    [string]$Detail
  )

  $steps = Get-Steps -Type $Type -Route $Route -Noun $Noun -Detail $Detail
  $precondition = switch ($Type) {
    'Login' { 'User account is active and tenant is valid' }
    'NegativeLogin' { 'User account exists' }
    'Dashboard' { 'User is logged in with a known role' }
    'Logout' { 'User is logged in' }
    'List' { "Tenant already has $Noun records" }
    'Create' { "Tenant has the required master data for $Detail" }
    'Update' { "An existing $Noun record is available" }
    'Workflow' { "A draft or active $Noun record exists" }
    'Relation' { "The target record exists and related data is available" }
    'Decision' { "A pending decision record exists and the user has decision rights" }
    'Upload' { 'The tenant can upload files and the page is accessible' }
    'Export' { 'Filtered data exists and the user can access the page' }
    'ReadOnly' { 'The user lacks edit permission or the record is in a locked state' }
    'Scorecard' { 'KPI measurements already exist for at least one period' }
    'Members' { "An audit or checklist container exists for $Detail" }
    'Finding' { "Checklist items or findings already exist for $Detail" }
    default { "A $Noun record exists" }
  }

  $testData = switch ($Type) {
    'Login' { 'valid email/password' }
    'NegativeLogin' { 'wrong password or unknown account' }
    'Dashboard' { 'role-based access' }
    'Logout' { 'logout click' }
    'List' { $Detail }
    'Create' { $Detail }
    'Update' { $Detail }
    'Workflow' { $Detail }
    'Relation' { $Detail }
    'Decision' { 'decision note' }
    'Upload' { 'supported or invalid file' }
    'Export' { 'export filters' }
    'ReadOnly' { 'no permission or locked state' }
    'Scorecard' { 'selected period' }
    'Members' { 'identity, section, or checklist item data' }
    'Finding' { 'finding code, severity, and notes' }
    default { $Detail }
  }

  $expected = switch ($Type) {
    'Login' { 'Session is created, the user is redirected to home, and dashboard content renders.' }
    'NegativeLogin' { 'An error message is shown and the page stays on login without creating a session.' }
    'Dashboard' { 'Summary cards render, launchers appear according to role, and links navigate correctly.' }
    'Logout' { 'Session is cleared, the user is redirected to login, and protected pages are no longer accessible.' }
    'List' { "Only matching $Noun rows are shown with correct pagination." }
    'Create' { "The new $Noun is stored and visible in the registry or detail page." }
    'Update' { "Updated values persist after save and page refresh." }
    'Workflow' { 'The status changes correctly and the detail page reflects the final state.' }
    'Relation' { 'The relation is saved and the linked records or counters refresh correctly.' }
    'Decision' { 'The decision status changes and the audit trail or source workflow updates.' }
    'Upload' { 'The file is stored, listed, and downloadable, or validation is shown for invalid input.' }
    'Export' { 'The file downloads successfully in the expected format and with filtered content.' }
    'ReadOnly' { 'The page blocks editing and no data change occurs.' }
    'Scorecard' { 'The scorecard summary, trend indicators, and status badges refresh for the selected period.' }
    'Members' { 'The roster or checklist structure is saved and visible in the detail page.' }
    'Finding' { 'Checklist results or findings are saved and the list reflects the updated status.' }
    default { 'The UI and data reflect the new state.' }
  }

  $Rows.Add([pscustomobject]@{
    'TC ID'           = $TcId
    'Module'          = $Module
    'Feature'         = $Feature
    'Function'        = $FunctionText
    'Scenario'        = $Scenario
    'Type'            = $Type
    'Role'            = $Role
    'Priority'        = $Priority
    'Route'           = $Route
    'Precondition'    = $precondition
    'Test Data'       = $testData
    'Steps'           = ($steps -join "`n")
    'Expected Result' = $expected
    'Notes'           = ''
  }) | Out-Null
}

$moduleSummary = @(
  [pscustomobject]@{ Module = 'Auth and Dashboard'; Route = '/login, /'; Purpose = 'Login/session handling, dashboard summary cards, launcher visibility, and logout'; PrimaryRole = 'All authenticated users'; KeyFeatures = 'Login, refresh, logout, dashboard, launcher access'; Notes = 'Basis: apps/web/app/login and apps/web/app/page.tsx' },
  [pscustomobject]@{ Module = 'Assets'; Route = '/assets'; Purpose = 'Asset registry, detail, ownership, lifecycle, evidence, software, and transfer actions'; PrimaryRole = 'ITAM_MANAGER'; KeyFeatures = 'List/search/filter, create, edit, ownership, lifecycle, software panels'; Notes = 'Basis: apps/web/app/assets/*' },
  [pscustomobject]@{ Module = 'Approvals'; Route = '/approvals'; Purpose = 'Queue approvals and decide workflow outcomes'; PrimaryRole = 'TENANT_ADMIN, ITAM_MANAGER, PROCUREMENT_CONTRACT_MANAGER'; KeyFeatures = 'Queue, detail, approve, reject, audit trail'; Notes = 'Basis: apps/web/app/approvals/*' },
  [pscustomobject]@{ Module = 'Documents'; Route = '/documents'; Purpose = 'Document registry with versioning and workflow states'; PrimaryRole = 'TENANT_ADMIN, ITAM_MANAGER'; KeyFeatures = 'List, create, version, submit, approve, publish, archive'; Notes = 'Basis: apps/web/app/documents/*' },
  [pscustomobject]@{ Module = 'Evidence'; Route = '/evidence'; Purpose = 'Upload and attach evidence files to records'; PrimaryRole = 'TENANT_ADMIN, ITAM_MANAGER, ASSET_CUSTODIAN'; KeyFeatures = 'Upload, validate, list, download, attach'; Notes = 'Basis: apps/web/app/evidence/* and asset evidence panels' },
  [pscustomobject]@{ Module = 'Audit Events'; Route = '/audit-events'; Purpose = 'Read-only audit trail viewer and export'; PrimaryRole = 'SUPERADMIN, TENANT_ADMIN, ITAM_MANAGER, AUDITOR'; KeyFeatures = 'List, filter, payload view, export JSON'; Notes = 'Basis: apps/web/app/audit-events/*' },
  [pscustomobject]@{ Module = 'Governance'; Route = '/governance/scope, /governance/context, /governance/stakeholders'; Purpose = 'Scope version workflow plus context and stakeholder registers'; PrimaryRole = 'TENANT_ADMIN, ITAM_MANAGER'; KeyFeatures = 'Submit/approve/activate scope, register context, register stakeholders'; Notes = 'Basis: apps/web/app/governance/*' },
  [pscustomobject]@{ Module = 'Vendors'; Route = '/vendors'; Purpose = 'Vendor registry used by contracts and software products'; PrimaryRole = 'TENANT_ADMIN, PROCUREMENT_CONTRACT_MANAGER, ITAM_MANAGER'; KeyFeatures = 'List/search, create, update, validation'; Notes = 'Basis: apps/web/app/vendors/*' },
  [pscustomobject]@{ Module = 'Contracts'; Route = '/contracts'; Purpose = 'Contract registry plus document, evidence, asset, and entitlement relations'; PrimaryRole = 'TENANT_ADMIN, PROCUREMENT_CONTRACT_MANAGER, ITAM_MANAGER'; KeyFeatures = 'List/filter, create/update, relations, entitlement allocation, expiry health'; Notes = 'Basis: apps/web/app/contracts/*' },
  [pscustomobject]@{ Module = 'Software Products'; Route = '/software-products'; Purpose = 'Software product registry with vendor linkage'; PrimaryRole = 'TENANT_ADMIN, PROCUREMENT_CONTRACT_MANAGER, ITAM_MANAGER'; KeyFeatures = 'List/search, create, update, detail'; Notes = 'Basis: apps/web/app/software-products/*' },
  [pscustomobject]@{ Module = 'Asset Transfer Requests'; Route = '/asset-transfer-requests'; Purpose = 'Cross-tenant asset transfer workflow with decision and execution logs'; PrimaryRole = 'SUPERADMIN, TENANT_ADMIN, ITAM_MANAGER'; KeyFeatures = 'List/filter, create draft, submit, approve/reject, execute/cancel'; Notes = 'Basis: apps/web/app/asset-transfer-requests/*' },
  [pscustomobject]@{ Module = 'KPI Library and Scorecard'; Route = '/kpis, /kpi-scorecard'; Purpose = 'Manage KPI definitions and review scorecard performance by period'; PrimaryRole = 'ITAM_MANAGER, SUPERADMIN'; KeyFeatures = 'List/filter, create manual/system KPI, update thresholds, scorecard trend'; Notes = 'Basis: apps/web/app/kpis/* and apps/web/app/kpi-scorecard/*' },
  [pscustomobject]@{ Module = 'Internal Audits'; Route = '/internal-audits'; Purpose = 'Internal audit register, checklist, members, findings, and lifecycle'; PrimaryRole = 'AUDITOR, TENANT_ADMIN, ITAM_MANAGER'; KeyFeatures = 'Create audit, manage members, checklist, record results, findings, start/complete/cancel'; Notes = 'Basis: apps/web/app/internal-audits/*' },
  [pscustomobject]@{ Module = 'Management Reviews'; Route = '/management-reviews'; Purpose = 'Management review sessions, decisions, action items, and tracker'; PrimaryRole = 'TENANT_ADMIN, ITAM_MANAGER'; KeyFeatures = 'List/create, overview update, decisions, action items, tracker, complete/cancel'; Notes = 'Basis: apps/web/app/management-reviews/*' },
  [pscustomobject]@{ Module = 'Reports'; Route = '/reports/asset-coverage, /reports/asset-mapping'; Purpose = 'Coverage and mapping reports with filters and Excel export'; PrimaryRole = 'TENANT_ADMIN, ITAM_MANAGER, AUDITOR'; KeyFeatures = 'Summary, filters, drill-through, Excel export'; Notes = 'Basis: apps/web/app/reports/*' },
  [pscustomobject]@{ Module = 'Admin Master Data'; Route = '/admin/users, /admin/departments, /admin/locations, /admin/identities, /admin/asset-types, /admin/lifecycle-states'; Purpose = 'Tenant and platform master data maintenance'; PrimaryRole = 'SUPERADMIN, TENANT_ADMIN'; KeyFeatures = 'Users, departments, locations, identities, asset types, lifecycle states'; Notes = 'Basis: apps/web/app/admin/*' },
  [pscustomobject]@{ Module = 'Superadmin Tenants'; Route = '/superadmin/tenants'; Purpose = 'Platform tenant registry, sorting, and subscription health'; PrimaryRole = 'SUPERADMIN'; KeyFeatures = 'List/search/sort, create tenant, detail health/status'; Notes = 'Basis: apps/web/app/superadmin/tenants/*' }
)

$modules = @(
  @{ Module = 'Auth and Dashboard'; Route = '/login, /'; Role = 'All authenticated users'; Noun = 'session'; Cases = @(
      @{ TcId = 'AUTH-001'; Type = 'Login'; Feature = 'Login'; FunctionText = 'Start tenant session'; Scenario = 'Login with valid tenant credentials'; Detail = 'tenant login session'; Priority = 'High' },
      @{ TcId = 'AUTH-002'; Type = 'NegativeLogin'; Feature = 'Login'; FunctionText = 'Reject invalid credentials'; Scenario = 'Login with invalid password'; Detail = 'tenant login session'; Priority = 'High' },
      @{ TcId = 'AUTH-003'; Type = 'Refresh'; Feature = 'Session refresh'; FunctionText = 'Recover from expired access token'; Scenario = 'Auto refresh when a protected request gets 401'; Detail = 'session refresh flow'; Priority = 'High' },
      @{ TcId = 'AUTH-004'; Type = 'Dashboard'; Feature = 'Dashboard visibility'; FunctionText = 'Show summary cards and launchers by role'; Scenario = 'Open dashboard and verify launcher visibility'; Detail = 'dashboard launchers'; Priority = 'High' },
      @{ TcId = 'AUTH-005'; Type = 'Logout'; Feature = 'Logout'; FunctionText = 'End session safely'; Scenario = 'Logout from the application shell'; Detail = 'logout action'; Priority = 'High' }
    ) },
  @{ Module = 'Assets'; Route = '/assets'; Role = 'ITAM_MANAGER'; Noun = 'asset'; Cases = @(
      @{ TcId = 'ASSET-001'; Type = 'List'; Feature = 'List/Search/Filter'; FunctionText = 'Find assets quickly'; Scenario = 'Search assets by tag, type, and lifecycle state'; Detail = 'asset tag, type, lifecycle state'; Priority = 'High' },
      @{ TcId = 'ASSET-002'; Type = 'Create'; Feature = 'Create asset'; FunctionText = 'Register a new asset'; Scenario = 'Create asset from the new asset page'; Detail = 'asset registration'; Priority = 'High' },
      @{ TcId = 'ASSET-003'; Type = 'Relation'; Feature = 'Ownership and lifecycle'; FunctionText = 'Keep ownership and state traceable'; Scenario = 'Open ownership and lifecycle panels from asset detail'; Detail = 'ownership, lifecycle, evidence, and software panels'; Priority = 'High' }
    ) },
  @{ Module = 'Approvals'; Route = '/approvals'; Role = 'TENANT_ADMIN'; Noun = 'approval'; Cases = @(
      @{ TcId = 'APPR-001'; Type = 'List'; Feature = 'Queue view'; FunctionText = 'Review pending approvals'; Scenario = 'Filter approvals by status and search criteria'; Detail = 'approval queue'; Priority = 'High' },
      @{ TcId = 'APPR-002'; Type = 'Decision'; Feature = 'Approve decision'; FunctionText = 'Accept a pending approval'; Scenario = 'Approve an approval request from detail view'; Detail = 'approve action'; Priority = 'High' },
      @{ TcId = 'APPR-003'; Type = 'ReadOnly'; Feature = 'Role guard'; FunctionText = 'Block unauthorized decisions'; Scenario = 'Open approval detail with a non-decider role'; Detail = 'decision permission check'; Priority = 'High' }
    ) },
  @{ Module = 'Documents'; Route = '/documents'; Role = 'ITAM_MANAGER'; Noun = 'document'; Cases = @(
      @{ TcId = 'DOC-001'; Type = 'List'; Feature = 'List/Search/Filter'; FunctionText = 'Find documents by status and type'; Scenario = 'Search documents and filter by workflow state'; Detail = 'document list filters'; Priority = 'High' },
      @{ TcId = 'DOC-002'; Type = 'Create'; Feature = 'Create draft'; FunctionText = 'Register a new document'; Scenario = 'Create a document and initial version'; Detail = 'document creation'; Priority = 'High' },
      @{ TcId = 'DOC-003'; Type = 'Workflow'; Feature = 'Workflow actions'; FunctionText = 'Move document through lifecycle'; Scenario = 'Submit, approve, publish, and archive a document'; Detail = 'document workflow'; Priority = 'High' }
    ) },
  @{ Module = 'Evidence'; Route = '/evidence'; Role = 'ASSET_CUSTODIAN'; Noun = 'file'; Cases = @(
      @{ TcId = 'EVID-001'; Type = 'Upload'; Feature = 'Upload'; FunctionText = 'Store evidence files safely'; Scenario = 'Upload a supported evidence file successfully'; Detail = 'evidence upload'; Priority = 'High' },
      @{ TcId = 'EVID-002'; Type = 'Relation'; Feature = 'Attach to records'; FunctionText = 'Link evidence to business objects'; Scenario = 'Attach evidence to asset, document, approval, or contract'; Detail = 'target record, evidence file, note'; Priority = 'High' }
    ) },
  @{ Module = 'Audit Events'; Route = '/audit-events'; Role = 'AUDITOR'; Noun = 'audit event'; Cases = @(
      @{ TcId = 'AUD-001'; Type = 'List'; Feature = 'List and filter'; FunctionText = 'Inspect the audit trail'; Scenario = 'Filter audit events by actor, action, entity, and date'; Detail = 'audit filters'; Priority = 'High' },
      @{ TcId = 'AUD-002'; Type = 'Export'; Feature = 'Export'; FunctionText = 'Download audit data'; Scenario = 'Export audit events to JSON'; Detail = 'export filters'; Priority = 'Medium' }
    ) },
  @{ Module = 'Governance'; Route = '/governance/scope, /governance/context, /governance/stakeholders'; Role = 'TENANT_ADMIN'; Noun = 'governance record'; Cases = @(
      @{ TcId = 'GOV-001'; Type = 'Create'; Feature = 'Scope version'; FunctionText = 'Prepare scope change'; Scenario = 'Create a draft scope version'; Detail = 'scope version creation'; Priority = 'High' },
      @{ TcId = 'GOV-002'; Type = 'Workflow'; Feature = 'Scope workflow'; FunctionText = 'Move scope through approval chain'; Scenario = 'Submit, approve, and activate the scope version'; Detail = 'submit approve activate'; Priority = 'High' },
      @{ TcId = 'GOV-003'; Type = 'Create'; Feature = 'Context and stakeholders'; FunctionText = 'Track context and stakeholder records'; Scenario = 'Create or edit context and stakeholder entries'; Detail = 'context and stakeholder register entries'; Priority = 'Medium' }
    ) },
  @{ Module = 'Vendors'; Route = '/vendors'; Role = 'PROCUREMENT_CONTRACT_MANAGER'; Noun = 'vendor'; Cases = @(
      @{ TcId = 'VEND-001'; Type = 'List'; Feature = 'List/Search/Filter'; FunctionText = 'Find vendor records'; Scenario = 'Search vendors by code or name'; Detail = 'vendor list search'; Priority = 'High' },
      @{ TcId = 'VEND-002'; Type = 'Create'; Feature = 'Create vendor'; FunctionText = 'Register a new vendor'; Scenario = 'Create a vendor record from the list page'; Detail = 'vendor creation'; Priority = 'High' }
    ) },
  @{ Module = 'Contracts'; Route = '/contracts'; Role = 'PROCUREMENT_CONTRACT_MANAGER'; Noun = 'contract'; Cases = @(
      @{ TcId = 'CONT-001'; Type = 'List'; Feature = 'List/Health'; FunctionText = 'Track contract expiry'; Scenario = 'Filter contracts by status and health'; Detail = 'contract health filters'; Priority = 'High' },
      @{ TcId = 'CONT-002'; Type = 'Create'; Feature = 'Create and update'; FunctionText = 'Register contract master data'; Scenario = 'Create a contract and edit its header fields'; Detail = 'contract creation and edit'; Priority = 'High' },
      @{ TcId = 'CONT-003'; Type = 'Relation'; Feature = 'Relations and entitlements'; FunctionText = 'Connect supporting data'; Scenario = 'Use relation panels and entitlement allocation'; Detail = 'document, asset, evidence, and entitlement allocation'; Priority = 'High' }
    ) },
  @{ Module = 'Software Products'; Route = '/software-products'; Role = 'PROCUREMENT_CONTRACT_MANAGER'; Noun = 'software product'; Cases = @(
      @{ TcId = 'SW-001'; Type = 'List'; Feature = 'List/Search/Filter'; FunctionText = 'Find software products'; Scenario = 'Search software products by code, name, or publisher'; Detail = 'software product list search'; Priority = 'High' },
      @{ TcId = 'SW-002'; Type = 'Create'; Feature = 'Create product'; FunctionText = 'Register a new software product'; Scenario = 'Create a software product from the list page'; Detail = 'software product creation'; Priority = 'High' }
    ) },
  @{ Module = 'Asset Transfer Requests'; Route = '/asset-transfer-requests'; Role = 'ITAM_MANAGER'; Noun = 'transfer request'; Cases = @(
      @{ TcId = 'TR-001'; Type = 'List'; Feature = 'List/Search/Filter'; FunctionText = 'Review transfer request queue'; Scenario = 'Filter transfer requests by status and search text'; Detail = 'transfer request queue'; Priority = 'High' },
      @{ TcId = 'TR-002'; Type = 'Create'; Feature = 'Create draft'; FunctionText = 'Prepare a transfer request'; Scenario = 'Create a draft transfer request for an asset'; Detail = 'draft transfer request'; Priority = 'High' },
      @{ TcId = 'TR-003'; Type = 'Workflow'; Feature = 'Submit and decide'; FunctionText = 'Move the request through approval'; Scenario = 'Submit the request and then approve or reject it'; Detail = 'submit approve reject'; Priority = 'High' }
    ) },
  @{ Module = 'KPI Library and Scorecard'; Route = '/kpis, /kpi-scorecard'; Role = 'ITAM_MANAGER'; Noun = 'KPI'; Cases = @(
      @{ TcId = 'KPI-001'; Type = 'List'; Feature = 'KPI list and filter'; FunctionText = 'Manage KPI definitions'; Scenario = 'Search KPI definitions by code, category, source type, and active flag'; Detail = 'KPI library filters'; Priority = 'High' },
      @{ TcId = 'KPI-002'; Type = 'Create'; Feature = 'Create manual KPI'; FunctionText = 'Add a custom KPI'; Scenario = 'Create a KPI definition using manual source type'; Detail = 'manual KPI definition'; Priority = 'High' },
      @{ TcId = 'KPI-003'; Type = 'Scorecard'; Feature = 'Scorecard view'; FunctionText = 'Monitor KPI status over time'; Scenario = 'Open the KPI scorecard and change the period'; Detail = 'period and trend check'; Priority = 'High' }
    ) },
  @{ Module = 'Internal Audits'; Route = '/internal-audits'; Role = 'AUDITOR'; Noun = 'internal audit'; Cases = @(
      @{ TcId = 'IA-001'; Type = 'Create'; Feature = 'List and create'; FunctionText = 'Register an internal audit'; Scenario = 'List audits and create a new audit header'; Detail = 'audit header creation'; Priority = 'High' },
      @{ TcId = 'IA-002'; Type = 'Members'; Feature = 'Members and checklist'; FunctionText = 'Build the audit structure'; Scenario = 'Add members and checklist sections or items'; Detail = 'member and checklist setup'; Priority = 'High' },
      @{ TcId = 'IA-003'; Type = 'Finding'; Feature = 'Results and findings'; FunctionText = 'Capture audit evidence'; Scenario = 'Record checklist results and create findings'; Detail = 'results and findings'; Priority = 'High' }
    ) },
  @{ Module = 'Management Reviews'; Route = '/management-reviews'; Role = 'ITAM_MANAGER'; Noun = 'management review session'; Cases = @(
      @{ TcId = 'MR-001'; Type = 'Create'; Feature = 'List and create'; FunctionText = 'Track review sessions'; Scenario = 'Search review sessions and create a new session'; Detail = 'review session creation'; Priority = 'High' },
      @{ TcId = 'MR-002'; Type = 'Update'; Feature = 'Overview and decisions'; FunctionText = 'Maintain review content'; Scenario = 'Edit the session overview and add a decision record'; Detail = 'overview and decision record'; Priority = 'High' },
      @{ TcId = 'MR-003'; Type = 'Relation'; Feature = 'Action items'; FunctionText = 'Track follow-up work'; Scenario = 'Add action items and update follow-up progress'; Detail = 'action item management'; Priority = 'High' }
    ) },
  @{ Module = 'Reports'; Route = '/reports/asset-coverage, /reports/asset-mapping'; Role = 'AUDITOR'; Noun = 'report row'; Cases = @(
      @{ TcId = 'REP-001'; Type = 'List'; Feature = 'Asset coverage'; FunctionText = 'Measure coverage health'; Scenario = 'Open the asset coverage report and use the filters'; Detail = 'coverage kind, health, vendor, contract health'; Priority = 'High' },
      @{ TcId = 'REP-002'; Type = 'List'; Feature = 'Asset mapping'; FunctionText = 'Measure mapping completeness'; Scenario = 'Open the asset mapping report and use the filters'; Detail = 'department, location, owner, link status'; Priority = 'High' },
      @{ TcId = 'REP-003'; Type = 'Export'; Feature = 'Export and drill-through'; FunctionText = 'Produce a usable export'; Scenario = 'Export the report to Excel and open a row detail link'; Detail = 'export Excel and drill-through'; Priority = 'High' }
    ) },
  @{ Module = 'Admin Master Data'; Route = '/admin/users, /admin/departments, /admin/locations, /admin/identities, /admin/asset-types, /admin/lifecycle-states'; Role = 'SUPERADMIN'; Noun = 'master data'; Cases = @(
      @{ TcId = 'ADMIN-001'; Type = 'Create'; Feature = 'Users'; FunctionText = 'Manage application users'; Scenario = 'List users, create a user, and change roles'; Detail = 'user administration'; Priority = 'High' },
      @{ TcId = 'ADMIN-002'; Type = 'Update'; Feature = 'Departments and locations'; FunctionText = 'Maintain tenant master data'; Scenario = 'Create and edit department and location records'; Detail = 'department and location maintenance'; Priority = 'High' },
      @{ TcId = 'ADMIN-003'; Type = 'Update'; Feature = 'Identities and states'; FunctionText = 'Maintain identity and reference data'; Scenario = 'Create and edit identities, asset types, and lifecycle states'; Detail = 'identity, asset type, and lifecycle state maintenance'; Priority = 'High' }
    ) },
  @{ Module = 'Superadmin Tenants'; Route = '/superadmin/tenants'; Role = 'SUPERADMIN'; Noun = 'tenant'; Cases = @(
      @{ TcId = 'SA-001'; Type = 'List'; Feature = 'List/Search/Sort'; FunctionText = 'Review platform tenants'; Scenario = 'Search and sort tenants by status and contract health'; Detail = 'status, contract health, sort field'; Priority = 'High' },
      @{ TcId = 'SA-002'; Type = 'Create'; Feature = 'Create tenant'; FunctionText = 'Register a new tenant'; Scenario = 'Create a tenant with plan and contract dates'; Detail = 'tenant creation'; Priority = 'High' },
      @{ TcId = 'SA-003'; Type = 'ReadOnly'; Feature = 'Role guard'; FunctionText = 'Keep access restricted to superadmin'; Scenario = 'Attempt to open the page with a non-superadmin role'; Detail = 'superadmin permission check'; Priority = 'High' }
    ) }
)

$scenarioRows = New-Object 'System.Collections.Generic.List[object]'

foreach ($module in $modules) {
  foreach ($case in $module.Cases) {
    Add-Scenario -Rows $scenarioRows -TcId $case.TcId -Module $module.Module -Feature $case.Feature -FunctionText $case.FunctionText -Scenario $case.Scenario -Type $case.Type -Role $module.Role -Priority $case.Priority -Route $module.Route -Noun $module.Noun -Detail $case.Detail
  }
}

function New-WorkbookSheet {
  param($Workbook, [string]$Name)
  $sheet = $Workbook.Worksheets.Add()
  $sheet.Name = $Name
  return $sheet
}

function Write-Table {
  param(
    $Sheet,
    [int]$StartRow,
    [int]$StartCol,
    [System.Collections.Generic.List[object]]$Rows,
    [string[]]$Headers
  )

  for ($i = 0; $i -lt $Headers.Count; $i++) {
    $Sheet.Cells.Item($StartRow, $StartCol + $i).Value2 = $Headers[$i]
    $Sheet.Cells.Item($StartRow, $StartCol + $i).Font.Bold = $true
    $Sheet.Cells.Item($StartRow, $StartCol + $i).Interior.ColorIndex = 36
  }

  for ($r = 0; $r -lt $Rows.Count; $r++) {
    $row = $Rows[$r]
    for ($c = 0; $c -lt $Headers.Count; $c++) {
      $header = $Headers[$c]
      $Sheet.Cells.Item($StartRow + 1 + $r, $StartCol + $c).Value2 = $row.$header
      $Sheet.Cells.Item($StartRow + 1 + $r, $StartCol + $c).WrapText = $true
      $Sheet.Cells.Item($StartRow + 1 + $r, $StartCol + $c).VerticalAlignment = -4160
    }
  }

  $lastRow = $StartRow + $Rows.Count
  $lastCol = $StartCol + $Headers.Count - 1
  $Sheet.Range($Sheet.Cells.Item($StartRow, $StartCol), $Sheet.Cells.Item($lastRow, $lastCol)).Borders.LineStyle = 1
  $Sheet.Range($Sheet.Cells.Item($StartRow, $StartCol), $Sheet.Cells.Item($lastRow, $lastCol)).Rows.AutoFit() | Out-Null
  $Sheet.Range($Sheet.Cells.Item($StartRow, $StartCol), $Sheet.Cells.Item($lastRow, $lastCol)).AutoFilter() | Out-Null
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$workbook = $excel.Workbooks.Add()

$overview = $workbook.Worksheets.Item(1)
$overview.Name = 'Overview'
$scenarios = New-WorkbookSheet -Workbook $workbook -Name 'Test Scenarios'

$overview.Cells.Item(1, 1).Value2 = 'ITAM Test Scenario Workbook'
$overview.Cells.Item(2, 1).Value2 = 'First-pass coverage generated from the current codebase route structure. Review and refine business rules before execution.'
$overview.Cells.Item(1, 1).Font.Bold = $true
$overview.Cells.Item(1, 1).Font.Size = 16
$overview.Range('A2:F2').Merge() | Out-Null
$overview.Cells.Item(2, 1).WrapText = $true

$summaryHeaders = @('Module', 'Route', 'Purpose', 'PrimaryRole', 'KeyFeatures', 'Notes')
Write-Table -Sheet $overview -StartRow 4 -StartCol 1 -Rows ([System.Collections.Generic.List[object]]$moduleSummary) -Headers $summaryHeaders

$scenarioHeaders = @('TC ID', 'Module', 'Feature', 'Function', 'Scenario', 'Type', 'Role', 'Priority', 'Route', 'Precondition', 'Test Data', 'Steps', 'Expected Result', 'Notes')
Write-Table -Sheet $scenarios -StartRow 1 -StartCol 1 -Rows $scenarioRows -Headers $scenarioHeaders

$overview.Columns.Item(1).ColumnWidth = 24
$overview.Columns.Item(2).ColumnWidth = 28
$overview.Columns.Item(3).ColumnWidth = 55
$overview.Columns.Item(4).ColumnWidth = 28
$overview.Columns.Item(5).ColumnWidth = 45
$overview.Columns.Item(6).ColumnWidth = 34

$scenarios.Columns.Item(1).ColumnWidth = 12
$scenarios.Columns.Item(2).ColumnWidth = 24
$scenarios.Columns.Item(3).ColumnWidth = 24
$scenarios.Columns.Item(4).ColumnWidth = 28
$scenarios.Columns.Item(5).ColumnWidth = 34
$scenarios.Columns.Item(6).ColumnWidth = 14
$scenarios.Columns.Item(7).ColumnWidth = 22
$scenarios.Columns.Item(8).ColumnWidth = 10
$scenarios.Columns.Item(9).ColumnWidth = 26
$scenarios.Columns.Item(10).ColumnWidth = 34
$scenarios.Columns.Item(11).ColumnWidth = 28
$scenarios.Columns.Item(12).ColumnWidth = 55
$scenarios.Columns.Item(13).ColumnWidth = 50
$scenarios.Columns.Item(14).ColumnWidth = 30

$outPath = Join-Path $PSScriptRoot 'testing-scenario-itam.xlsx'
if (Test-Path $outPath) { Remove-Item $outPath -Force }
$workbook.SaveAs($outPath, 51)
$workbook.Close($true)
$excel.Quit()

[System.Runtime.InteropServices.Marshal]::ReleaseComObject($scenarios) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($overview) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Output $outPath
