import { Badge } from "@/components/ui/badge";

type OrganizationMember = {
  user_id: string;
  is_org_admin: boolean;
  created_at: string;
  profile: { display_name: string | null; email: string | null } | null;
};

type OrganizationInvitation = {
  id: string;
  email: string;
  invited_as_admin: boolean;
  status: string;
  expires_at: string;
};

export function OrganizationMembers({
  members,
  invitations,
}: {
  members: OrganizationMember[];
  invitations: OrganizationInvitation[];
}) {
  return (
    <div className="grid gap-6">
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Members</h2>
        <div className="mt-4 divide-y">
          {members.map((member) => (
            <div key={member.user_id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium">{member.profile?.display_name || member.profile?.email || "Member"}</p>
                {member.profile?.display_name && visibleEmail(member.profile.email) ? <p className="text-xs text-muted-foreground">{member.profile.email}</p> : null}
              </div>
              <Badge variant="outline">{member.is_org_admin ? "Customer admin" : "Member"}</Badge>
            </div>
          ))}
          {!members.length ? <p className="py-4 text-sm text-muted-foreground">No members yet.</p> : null}
        </div>
      </section>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Invitations</h2>
        <div className="mt-4 divide-y">
          {invitations.map((invitation) => (
            <div key={invitation.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium">{invitation.email}</p>
                <p className="text-xs text-muted-foreground">Expires {new Date(invitation.expires_at).toLocaleString("en-US", { timeZone: "UTC" })} UTC</p>
              </div>
              <Badge variant="outline">{invitation.status}{invitation.invited_as_admin ? " · Admin" : ""}</Badge>
            </div>
          ))}
          {!invitations.length ? <p className="py-4 text-sm text-muted-foreground">No invitations yet.</p> : null}
        </div>
      </section>
    </div>
  );
}

function visibleEmail(email?: string | null) {
  return email && !email.toLowerCase().endsWith("@login.invalid");
}
