# Permissions

Canonical list lives in `shared/src/permissions.ts` (`PERMISSIONS`, `ROLE_PRESETS`). This doc explains the rules around them.

## Base levels (F1.2)

| Level | Meaning |
|---|---|
| Owner | Created by signup. Full control. Cannot be modified by an Admin. Exactly one owner per workspace (transferable). |
| Admin | Everything the Owner can do except modify/remove the Owner or transfer ownership. |
| User | Only what their permissions allow. |

**Manager is not a level.** It is the `manager` preset in `shared/src/permissions.ts` applied to a User, and can be edited further from the UI (F1.3: permissions are not tied to role names).

## Permission keys (F1.3)

| Key | Grants |
|---|---|
| `crm.view` | See contacts, companies, opportunities, conversations |
| `crm.create` | Create records |
| `crm.edit` | Edit records, send messages, move stages, book appointments |
| `crm.delete` | Delete records |
| `crm.export` | Export lists (CSV) |
| `crm.view_value` | See opportunity values and payment amounts (F1.4) |
| `leads.view` | See leads, availability, recovery queue |
| `leads.assign` | Manually reassign leads |
| `assignment.manage_rules` | Edit assignment rules and escalation chain (F3.3) |
| `users.manage` | Invite users, change roles and permissions |
| `integrations.manage` | Connect/change/remove integrations (I5.7) |
| `audit.view` | Open audit history (F4.2) |
| `dashboard.company_view` | See company-wide dashboard figures instead of personal ones (F5.4) |

## Presets

| Preset | Permissions |
|---|---|
| `owner` | all |
| `admin` | all (server still blocks actions on the Owner account) |
| `manager` | `crm.view`, `crm.create`, `crm.edit`, `crm.export`, `crm.view_value`, `leads.view`, `leads.assign`, `assignment.manage_rules`, `dashboard.company_view` |
| `user` | `crm.view`, `crm.create`, `crm.edit`, `leads.view` |

## Enforcement rules

1. Server-side only: every endpoint checks `permission` (F1.5). The frontend uses the same keys purely to hide/disable UI.
2. `value` and payment amounts are masked at the API layer when `crm.view_value` is missing: `value: null, valueHidden: true` (F1.4).
3. Audit writes are automatic:
   - role/permission change → `role_change`, `permission_change` (before/after values)
   - assignment, acknowledge, escalation, reassignment → matching event types
   - pipeline/custom field edits → `config_change`
   - integration connect/disconnect → `integration_change`
   - deletions → `deletion`
4. Admin attempting to modify the Owner: `403 forbidden` with `details.reason = "cannot_modify_owner"`.
5. Integration credentials are write-only: the API never returns secrets, only `accountLabel` and status (I5.3).
