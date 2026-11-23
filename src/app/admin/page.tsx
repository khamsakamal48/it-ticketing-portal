import AppShell from "@/components/AppShell";
import { getActiveAgents } from "@/lib/queries";
import { getConfig, flag } from "@/lib/config";
import { auth, isManager } from "@/lib/auth";
import AddAgentForm from "./AddAgentForm";
import RemoveAgentButton from "./RemoveAgentButton";
import DefaultAssigneesCard from "./DefaultAssigneesCard";
import AckSettingsCard from "./AckSettingsCard";
import HoldEmailCard from "./HoldEmailCard";
import EscalationContactsCard from "./EscalationContactsCard";
import { getDeployment } from "@/lib/deployment";

export const dynamic = "force-dynamic";

// Read-only admin view of agents and the SLA / business-hours config that the
// n8n workflows use. (Edits are out of scope for v1 — config is owned by n8n.)
export default async function AdminPage() {
  const [agents, config, multiAssignee, session] = await Promise.all([
    getActiveAgents(),
    getConfig(),
    flag("multiAssignee"),
    auth(),
  ]);
  // Team deployments (multi-assignee): coordinators assign by hand, so the
  // round-robin/keyword assignment_strategy row means nothing there. n8n never
  // reads it. Admins/managers can add assignee-only agents there.
  const canAddAgents = multiAssignee && isManager(session?.user?.role);

  // Team settings the coordinator edits (db/011 set_team_setting). Same gate as
  // adding agents: multi-assignee deployments, managers/admins.
  const canEditSettings = canAddAgents;
  const defaultAssigneesEnabled = (config.default_assignees_enabled ?? "true").trim().toLowerCase() !== "false";
  const defaultAssigneeEmails = (config.default_assignee_emails ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  const ackEnabled = (config.ack_enabled ?? "true").trim().toLowerCase() !== "false";
  // Off unless explicitly 'true' (same default as n8n on coordinator-led teams).
  const holdEmailsRequester = (config.hold_notify_requester_enabled ?? "").trim().toLowerCase() === "true";

  const slaKeys = Object.keys(config)
    .filter((k) => k.startsWith("sla") || k.startsWith("business") || k.includes("assignment") || k.includes("reminder"))
    .filter((k) => !(multiAssignee && k === "assignment_strategy"))
    .sort();

  return (
    <AppShell active="/admin">
      <div className="animate-rise-in space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-fg">Configuration</h2>
        <p className="mt-1 text-sm text-subtle">
          {canAddAgents ? "Agents & SLA configuration — SLA settings are read-only, owned by n8n" : "Agents & SLA configuration — read-only, owned by n8n"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="card overflow-hidden p-0">
          <h3 className="border-b border-border px-5 py-4 text-sm font-semibold text-fg">
            Active agents <span className="tabular text-subtle">({agents.length})</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-5 py-2.5 font-medium">Email</th>
                  <th className="px-5 py-2.5 font-medium">Role</th>
                  {canAddAgents && <th className="px-5 py-2.5 font-medium"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agents.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-surface-2">
                    <td className="px-5 py-2.5 text-fg">{a.name}</td>
                    <td className="px-5 py-2.5 text-muted">{a.email}</td>
                    <td className="px-5 py-2.5 capitalize text-muted">{a.role}</td>
                    {canAddAgents && (
                      <td className="px-5 py-1.5">
                        {/* Only assignee-only agents; portal users (coordinator, admins) are managed by IT. */}
                        {a.role === "agent" && !a.can_login && String(a.id) !== session?.user?.id && (
                          <RemoveAgentButton userId={a.id} name={a.name} />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canAddAgents && <AddAgentForm />}
        </div>

        <div className="card overflow-hidden p-0">
          <h3 className="border-b border-border px-5 py-4 text-sm font-semibold text-fg">
            SLA & business configuration
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {slaKeys.map((k) => (
                  <tr key={k} className="transition-colors hover:bg-surface-2">
                    <td className="px-5 py-2.5 font-mono text-xs text-muted">{k}</td>
                    <td className="px-5 py-2.5 font-medium text-fg">{config[k]}</td>
                  </tr>
                ))}
                {slaKeys.length === 0 && (
                  <tr>
                    <td className="px-5 py-6 text-center text-subtle">No config rows found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {canEditSettings && (
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-fg">Team settings</h3>
            <p className="mt-1 text-sm text-subtle">Changes apply to the next email that arrives.</p>
          </div>
          <DefaultAssigneesCard
            agents={agents.map((a) => ({ id: a.id, name: a.name, email: a.email }))}
            initialEnabled={defaultAssigneesEnabled}
            initialEmails={defaultAssigneeEmails}
          />
          <AckSettingsCard
            initialEnabled={ackEnabled}
            initialHtml={config.ack_body_html ?? ""}
            team={getDeployment().teamLabel}
            brand={{
              name: (config.email_brand_name ?? "").trim() || getDeployment().teamLabel,
              tagline: config.email_brand_tagline ?? "",
              footer: config.email_brand_footer ?? "",
            }}
          />
          <HoldEmailCard initialEnabled={holdEmailsRequester} />
          <EscalationContactsCard
            initialL2={config.manager_email ?? ""}
            initialL3={config.senior_manager_email ?? ""}
          />
        </div>
      )}
      </div>
    </AppShell>
  );
}
