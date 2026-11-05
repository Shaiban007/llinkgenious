export type NavItem = { label: string; href: string; icon: string; adminOnly?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" }],
  },
  {
    title: "Leads",
    items: [
      { label: "Lead Finder", href: "/finder", icon: "Search" },
      { label: "All Leads", href: "/leads", icon: "Users" },
      { label: "Pipeline", href: "/pipeline", icon: "KanbanSquare" },
      { label: "Companies", href: "/companies", icon: "Building2" },
    ],
  },
  {
    title: "Work",
    items: [
      { label: "Tasks & Follow-ups", href: "/tasks", icon: "CheckSquare" },
      { label: "Campaigns", href: "/campaigns", icon: "Megaphone" },
      { label: "Email Outbox", href: "/outbox", icon: "Mail" },
      { label: "AI Assistant", href: "/assistant", icon: "Sparkles" },
    ],
  },
  {
    title: "Performance",
    items: [
      { label: "KRA", href: "/kra", icon: "Target" },
      { label: "KPIs", href: "/kpi", icon: "Gauge" },
      { label: "Performance", href: "/performance", icon: "TrendingUp" },
      { label: "Analytics", href: "/analytics", icon: "BarChart3" },
      { label: "Reports", href: "/reports", icon: "FileText" },
    ],
  },
  {
    title: "Manage",
    items: [
      { label: "Notifications", href: "/notifications", icon: "Bell" },
      { label: "Team", href: "/team", icon: "UserCog", adminOnly: true },
      { label: "Integrations", href: "/integrations", icon: "Plug", adminOnly: true },
      { label: "Settings", href: "/settings", icon: "Settings" },
      { label: "Help", href: "/help", icon: "LifeBuoy" },
    ],
  },
];
