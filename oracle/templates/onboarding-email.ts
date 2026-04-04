// ---------------------------------------------------------------------------
// Onboarding Email — sent 1 hour after activation
// ---------------------------------------------------------------------------
// Second email. The agent asks the client to share context about their
// business so it can work more effectively. Short, specific, actionable.
// Client replies with answers + attachments. Agent stores in memory.
// ---------------------------------------------------------------------------

interface OnboardingEmailOptions {
  agentName: string;
  clientFirstName: string;
  clientBusinessName: string;
  agentType: string;
}

export function buildOnboardingEmail(options: OnboardingEmailOptions): {
  subject: string;
  html: string;
} {
  const { agentName, clientFirstName, clientBusinessName, agentType } = options;

  const subject = `${agentName} — Quick setup to get started`;

  // Agent-type-specific questions
  const questions = getQuestionsForType(agentType);

  const questionHtml = questions
    .map((q, i) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
          <p style="margin: 0; font-size: 14px; color: #1a1a1a; font-weight: 600;">${i + 1}. ${q.question}</p>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #9ca3af;">${q.hint}</p>
        </td>
      </tr>`)
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f8f8f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Agent Header -->
          <tr>
            <td style="padding: 32px 40px 0 40px;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="width: 44px; vertical-align: top;">
                    <div style="width: 40px; height: 40px; background-color: #1a1a1a; border-radius: 10px; text-align: center; line-height: 40px; color: #ffffff; font-weight: 700; font-size: 17px;">${agentName[0]}</div>
                  </td>
                  <td style="padding-left: 14px;">
                    <p style="margin: 0; font-size: 16px; font-weight: 700; color: #1a1a1a;">${agentName}</p>
                    <p style="margin: 3px 0 0 0; font-size: 12px; color: #9ca3af;">Getting set up for ${clientBusinessName}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding: 24px 40px 0 40px; color: #374151; font-size: 15px; line-height: 1.7;">
              <p style="margin: 0 0 16px 0;">Hi ${clientFirstName},</p>
              <p style="margin: 0 0 16px 0;">To deliver the best results for ${clientBusinessName}, I need to understand a few things about your business. This takes about <strong>2 minutes</strong>.</p>
              <p style="margin: 0 0 8px 0;">Just reply to this email with your answers:</p>
            </td>
          </tr>

          <!-- Questions -->
          <tr>
            <td style="padding: 16px 40px 0 40px;">
              <table role="presentation" style="width: 100%;">
                ${questionHtml}
              </table>
            </td>
          </tr>

          <!-- Attachments -->
          <tr>
            <td style="padding: 24px 40px 0 40px;">
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; border: 1px dashed #e5e7eb;">
                <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">Attachments Welcome</p>
                <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
                  If you have any docs that would help me understand your business better — SOPs, brand guidelines, sales decks, FAQs, competitor lists — <strong>attach them to your reply</strong>. I'll study them and remember everything.
                </p>
              </div>
            </td>
          </tr>

          <!-- Security note -->
          <tr>
            <td style="padding: 20px 40px 0 40px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                  <span style="color: #15803d;">&#128274;</span> All communication is encrypted. Your data is stored securely and never shared.
                </p>
              </div>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 24px 40px 0 40px;">
              <div style="border-top: 1px solid #f0f0f0;"></div>
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td style="padding: 20px 40px 32px 40px; color: #9ca3af; font-size: 13px; line-height: 1.6;">
              <p style="margin: 0;">— ${agentName}, your AI agent at Ambitt</p>
              <p style="margin: 4px 0 0 0;">Powered by <a href="https://ambitt.agency" style="color: #6b7280; text-decoration: none;">Ambitt Agents</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

// ---------------------------------------------------------------------------
// Questions by agent type
// ---------------------------------------------------------------------------

interface OnboardingQuestion {
  question: string;
  hint: string;
}

function getQuestionsForType(agentType: string): OnboardingQuestion[] {
  const common: OnboardingQuestion[] = [
    {
      question: "Who is your ideal customer?",
      hint: "e.g. Series A SaaS founders, local restaurant owners, enterprise HR teams",
    },
    {
      question: "What's your biggest challenge right now?",
      hint: "The one thing that, if solved, would move the needle most",
    },
  ];

  const typeSpecific: Record<string, OnboardingQuestion[]> = {
    sales: [
      { question: "Describe your sales process in 2-3 sentences", hint: "How do leads come in and how do they convert?" },
      { question: "What tools do you currently use for outreach?", hint: "e.g. LinkedIn, cold email, referrals, conferences" },
    ],
    marketing: [
      { question: "What marketing channels are working best for you?", hint: "e.g. Google Ads, content, social, referrals" },
      { question: "What's your monthly marketing budget?", hint: "Rough range is fine — helps me prioritize recommendations" },
    ],
    analytics: [
      { question: "What metrics do you track most closely?", hint: "e.g. MRR, signups, activation rate, churn" },
      { question: "How often do you look at your data?", hint: "Daily, weekly, monthly? Do you have dashboards?" },
    ],
    support: [
      { question: "What are the top 3 questions your customers ask?", hint: "The ones that come up over and over" },
      { question: "What's your current response time target?", hint: "e.g. under 4 hours, under 24 hours" },
    ],
    content: [
      { question: "Describe your brand voice in 3 words", hint: "e.g. professional, warm, direct / casual, funny, bold" },
      { question: "Who are your top 3 competitors?", hint: "I'll study their content strategy" },
    ],
    engagement: [
      { question: "What does your onboarding flow look like?", hint: "Steps a new user takes from signup to 'aha moment'" },
      { question: "Where are users dropping off?", hint: "If you know — if not, I'll find out" },
    ],
    ops: [
      { question: "What's your deployment process?", hint: "e.g. GitHub → CI → staging → production" },
      { question: "What breaks most often?", hint: "The recurring issues that eat your team's time" },
    ],
    research: [
      { question: "What decisions are you trying to make?", hint: "What would the research inform?" },
      { question: "What sources do you trust most?", hint: "e.g. industry reports, competitor sites, academic papers" },
    ],
  };

  return [...common, ...(typeSpecific[agentType] ?? [])];
}
