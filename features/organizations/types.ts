export type OrganizationActionState = {
  success: boolean;
  message?: string;
  invitationLink?: string;
  organizationId?: string;
};

export const initialOrganizationActionState: OrganizationActionState = {
  success: false,
};
