export type SidebarNavigationItem = {
  label: string;
  href: string;
  matchPath?: string;
};

export type SidebarNavigationSection = {
  title: string;
  items: SidebarNavigationItem[];
};

export const sidebarNavigation: SidebarNavigationSection[] = [
  {
    title: "Asset Management",
    items: [
      { label: "Assets", href: "/assets" },
      { label: "Asset Transfers", href: "/asset-transfer-requests" },
      { label: "Vendors", href: "/vendors" },
      { label: "Contracts", href: "/contracts" },
      { label: "Asset Report", href: "/reports/asset-mapping" },
    ],
  },
  {
    title: "Governance",
    items: [
      { label: "Governance Scope", href: "/governance/scope" },
      { label: "Governance Context", href: "/governance/context" },
      { label: "Governance Stakeholders", href: "/governance/stakeholders" },
      { label: "Documents", href: "/documents" },
      { label: "Evidence", href: "/evidence" },
    ],
  },
  {
    title: "Audit & Compliance",
    items: [
      { label: "Approvals", href: "/approvals?status=PENDING", matchPath: "/approvals" },
      { label: "Audit Events", href: "/audit-events" },
      { label: "Internal Audits", href: "/internal-audits" },
      { label: "CAPA", href: "/capa" },
    ],
  },
  {
    title: "Management",
    items: [
      { label: "Admin Users", href: "/admin/users" },
      { label: "Tenant Management", href: "/superadmin/tenants", matchPath: "/superadmin/tenants" },
      { label: "Departments", href: "/admin/departments" },
      { label: "Locations", href: "/admin/locations" },
      { label: "Identities", href: "/admin/identities" },
      { label: "Asset Types", href: "/admin/asset-types" },
      { label: "Lifecycle States", href: "/admin/lifecycle-states" },
      { label: "Management Review", href: "/management-reviews" },
    ],
  },
  {
    title: "Performance",
    items: [
      { label: "KPI Library", href: "/kpis", matchPath: "/kpis" },
      { label: "KPI Scorecard", href: "/kpi-scorecard", matchPath: "/kpi-scorecard" },
    ],
  },
  {
    title: "Software & Tools",
    items: [{ label: "Software Products", href: "/software-products" }],
  },
];