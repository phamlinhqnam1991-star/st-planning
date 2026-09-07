/**
 * Client-safe ERP component barrel.
 *
 * IMPORTANT: do not export ErpAppShell from this module. ErpAppShell is a
 * server component and imports the Aiven/PostgreSQL authorization layer.
 * Client Components must import from this file so the `pg` package is never
 * pulled into the browser bundle.
 */
export { ErpPageHeader } from "./erp-page-header";
export { ErpToolbar } from "./erp-toolbar";
export { ErpStatus } from "./erp-status";
export { ErpKpiCard } from "./erp-kpi-card";
export { ErpSection } from "./erp-section";
export { ErpDataGrid, type ErpGridColumn } from "./erp-data-grid";
export { ErpFormGrid, ErpField } from "./erp-form";
export { ErpTabs } from "./erp-tabs";
export { ErpEmptyState } from "./erp-empty-state";
export * from "./planning/erp-planning-matrix";
