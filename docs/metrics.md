# Glossary and metric definitions (Section 7)

Each term has exactly one meaning everywhere: dashboard, lists, exports, audit history (Q12). Backend computes metrics from the same definitions; frontend never recalculates business figures.

| Term | Definition |
|---|---|
| Workspace | One company's isolated environment, with its own users, data, configuration and integrations |
| Lead | A record created by intake (web form, incoming message or manual entry) with a source label |
| Assigned time | The moment the system last assigned the lead to a person |
| Acknowledged | The assignee clicked Acknowledge, or performed a recorded action on the lead (note, message, call log, stage change, appointment) |
| Time to first response | Time from the lead's first assignment to its first acknowledgement |
| Escalation | An automatic reassignment caused by an expired acknowledgement window; manual reassignments are counted separately |
| Recovery queue item | A lead that is unacknowledged beyond its window, has escalated two or more times, or has no recorded action for the configured idle period |
| Available employee | A user whose status is Available and whose open-lead count is below the configured limit |
| Open pipeline value | The sum of values of opportunities not in a won or lost stage, grouped by stage; shown only to users permitted to see values (`crm.view_value`) |
| Projected revenue | The value of open opportunities and of payment requests not yet paid |
| Collected revenue | The sum of payments confirmed by the payment provider's webhook, minus confirmed refunds |
| Conversation | All messages with one contact on one channel, linked to the contact, its assigned employee and, when applicable, an opportunity |
| Appointment | A calendar event created from the platform and linked to a contact or opportunity |
| Integration event | Any inbound webhook or outbound call to an external provider, recorded in the synchronization history |

## Dashboard figures (F5.1) and how they are computed

| Figure | Computation |
|---|---|
| New leads today | Leads assigned/created since 00:00 in the workspace time zone |
| Open pipeline value by stage | Per stage: sum of `value` of non-won/non-lost opportunities (masked without `crm.view_value`) |
| Average time to first response | Mean of (first acknowledgement − first assigned time) over a rolling window; shown in seconds |
| Recovery queue count | Items currently matching the recovery queue definition above |
| Escalations last 24h | Automatic reassignments with `at` within 24h |
| Employee availability | Current status + open lead count per user, with the "available" flag per the definition above |
| Upcoming appointments | Appointments with `startsAt >= now`, next 7 days |
| Payments received this month | Collected revenue since the 1st of the current month — **collected only**, never projected (F2.6/I) |

**Drill-down (F5.3):** the dashboard API returns enough identifiers (stageId, filter param sets) for each figure to open the corresponding filtered list — the list then uses the standard filter query params so the numbers always match.
