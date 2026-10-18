import { Link, useNavigate, useParams } from "react-router";
import { useCompany, useContacts, useOpportunities } from "../api/crm";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "../components/ui/card";
import { ErrorBlock, LoadingBlock } from "../components/ui/states";
import { TD, TH, TR, TableWrap } from "../components/ui/table";
import { formatMoney } from "../lib/format";

export function CompanyDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const companyQuery = useCompany(id);
  const contactsQuery = useContacts({ page: 1, pageSize: 100, companyId: id });
  const opportunitiesQuery = useOpportunities({ page: 1, pageSize: 100 });

  if (companyQuery.isPending) return <LoadingBlock />;
  if (companyQuery.isError) {
    return <ErrorBlock error={companyQuery.error} onRetry={() => void companyQuery.refetch()} />;
  }

  const company = companyQuery.data;
  const opportunities = (opportunitiesQuery.data?.data ?? []).filter(
    (opportunity) => opportunity.companyId === id,
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={company.name}
        description={company.domain ?? undefined}
        actions={<Button variant="secondary" onClick={() => navigate("/companies")}>Back to companies</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Details" />
          <CardBody className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Domain</p>
              <p className="text-slate-800">{company.domain ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Phone</p>
              <p className="text-slate-800">{company.phone ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Address</p>
              <p className="text-slate-800">{company.address ?? "—"}</p>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Contacts"
            description={
              contactsQuery.data ? `${contactsQuery.data.total} contacts at this company` : undefined
            }
          />
          {contactsQuery.isPending ? <LoadingBlock /> : null}
          {contactsQuery.data ? (
            <TableWrap>
              <thead>
                <tr>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Status</TH>
                </tr>
              </thead>
              <tbody>
                {contactsQuery.data.data.map((contact) => (
                  <TR key={contact.id}>
                    <TD>
                      <Link
                        to={`/contacts/${contact.id}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {contact.name}
                      </Link>
                    </TD>
                    <TD>{contact.email ?? contact.phone ?? "—"}</TD>
                    <TD>
                      {contact.optedOut ? (
                        <Badge tone="red">Opted out</Badge>
                      ) : (
                        <Badge tone="green">Active</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          ) : null}
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Opportunities" description={`${opportunities.length} deals`} />
          <CardBody className="space-y-2">
            {opportunities.length === 0 ? (
              <p className="text-sm text-slate-500">No opportunities at this company yet.</p>
            ) : null}
            {opportunities.map((opportunity) => (
              <div key={opportunity.id} className="flex items-center justify-between gap-3 text-sm">
                <Link
                  to={`/opportunities/${opportunity.id}`}
                  className="font-medium text-slate-800 underline-offset-2 hover:underline"
                >
                  {opportunity.title}
                </Link>
                <span className="text-slate-600">
                  {opportunity.valueHidden || opportunity.value === null
                    ? "•••"
                    : formatMoney(opportunity.value, opportunity.currency)}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
