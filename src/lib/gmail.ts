// Build a Gmail compose URL that opens Gmail web with the message
// pre-populated (recipient, subject, body). Behaves like mailto: but routes
// to gmail.com so users don't get punted to their OS default mail client.
//
// Reference: https://developers.google.com/gmail/api/guides/sending#compose_url

export function gmailComposeUrl({
  to,
  subject,
  body,
  cc,
  bcc,
}: {
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  cc?: string | null;
  bcc?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("view", "cm");
  params.set("fs", "1");
  if (to) params.set("to", to);
  if (cc) params.set("cc", cc);
  if (bcc) params.set("bcc", bcc);
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function openGmailCompose(args: Parameters<typeof gmailComposeUrl>[0]): void {
  if (typeof window === "undefined") return;
  window.open(gmailComposeUrl(args), "_blank", "noopener,noreferrer");
}
