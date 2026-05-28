// Delivery-status badge for any sent email. Shows the EmailSend lifecycle
// state (accepted → sent → delivered → bounced/complained) next to the
// "Sent Xm ago" timestamp on prospect/client pages. Closes the silent-
// failure loop: if the prospect never got the email, the badge turns red.
//
// Pure server-renderable display component. The parent server component
// is responsible for fetching the relevant EmailSend row from Prisma.

interface Props {
  // The full lifecycle of a single email send. All fields except `status`
  // are optional because Resend webhooks fill them in over time.
  emailSend: {
    status: string; // accepted | sent | delivered | bounced | complained | delivery_delayed | dropped
    acceptedAt: Date;
    sentAt: Date | null;
    deliveredAt: Date | null;
    bouncedAt: Date | null;
    complainedAt: Date | null;
    delayedAt: Date | null;
    bounceReason: string | null;
  } | null;
  // When non-null, shows a "just sent, no webhook yet" state. Avoids the
  // confusing "no badge at all" empty state when the send is very recent
  // and Resend hasn't fired the delivered webhook yet (typical lag: 5-30s).
  fallbackSentAt?: Date | null;
}

interface BadgeStyle {
  dot: string;
  text: string;
  bg: string;
  ring: string;
  label: string;
  tooltip: string;
}

function styleFor(status: string, bounceReason: string | null): BadgeStyle {
  switch (status) {
    case "delivered":
      return {
        dot: "bg-emerald-400",
        text: "text-emerald-400",
        bg: "bg-emerald-500/10",
        ring: "ring-emerald-500/20",
        label: "Delivered",
        tooltip: "Recipient mailbox accepted the email.",
      };
    case "sent":
      return {
        dot: "bg-sky-400",
        text: "text-sky-400",
        bg: "bg-sky-500/10",
        ring: "ring-sky-500/20",
        label: "Sent",
        tooltip: "Resend handed it to the recipient's mail server. Delivery confirmation pending.",
      };
    case "accepted":
      return {
        dot: "bg-amber-400",
        text: "text-amber-400",
        bg: "bg-amber-500/10",
        ring: "ring-amber-500/20",
        label: "Accepted",
        tooltip: "Resend's API accepted the email. Awaiting delivery confirmation from the recipient's server.",
      };
    case "delivery_delayed":
      return {
        dot: "bg-amber-400",
        text: "text-amber-400",
        bg: "bg-amber-500/10",
        ring: "ring-amber-500/20",
        label: "Delayed",
        tooltip: "Recipient server temporarily refused — Resend is retrying. This usually resolves on its own.",
      };
    case "bounced":
      return {
        dot: "bg-red-500",
        text: "text-red-400",
        bg: "bg-red-500/10",
        ring: "ring-red-500/30",
        label: "Bounced",
        tooltip: bounceReason
          ? `Hard or soft bounce. Reason: ${bounceReason.slice(0, 200)}`
          : "Hard or soft bounce. The prospect did not receive this email.",
      };
    case "complained":
      return {
        dot: "bg-orange-500",
        text: "text-orange-400",
        bg: "bg-orange-500/10",
        ring: "ring-orange-500/30",
        label: "Spam report",
        tooltip: "Recipient marked the email as spam. Future sends to this address may be filtered.",
      };
    case "dropped":
      return {
        dot: "bg-red-500",
        text: "text-red-400",
        bg: "bg-red-500/10",
        ring: "ring-red-500/30",
        label: "Dropped",
        tooltip: "Resend dropped before send (suppression list, etc).",
      };
    default:
      return {
        dot: "bg-zinc-500",
        text: "text-zinc-400",
        bg: "bg-zinc-500/10",
        ring: "ring-zinc-500/20",
        label: status,
        tooltip: `Unknown status: ${status}`,
      };
  }
}

export function EmailDeliveryBadge({ emailSend, fallbackSentAt }: Props) {
  // No row yet but the timestamp says it was sent — render a "pending webhook"
  // chip. This happens for any send within the first ~30s before Resend's
  // webhook reaches us, or for emails sent before the audit log was wired.
  if (!emailSend) {
    if (!fallbackSentAt) return null;
    const style = styleFor("accepted", null);
    return (
      <span
        title="Email handed to Resend. Delivery confirmation pending — Resend's webhook usually arrives within 30 seconds."
        className={`inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full ring-1 ${style.bg} ${style.text} ${style.ring}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} aria-hidden />
        Sending
      </span>
    );
  }

  const style = styleFor(emailSend.status, emailSend.bounceReason);
  return (
    <span
      title={style.tooltip}
      className={`inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full ring-1 ${style.bg} ${style.text} ${style.ring}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} aria-hidden />
      {style.label}
    </span>
  );
}
