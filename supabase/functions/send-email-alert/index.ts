import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const jsonHeaders = {
  'Content-Type': 'application/json',
  ...corsHeaders
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@example.com';

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  });
}

function getSubject(type: string) {
  switch (type) {
    case 'welcome':
      return 'Welcome to Expense Tracker';
    case 'expense_added':
      return 'Expense added';
    case 'large_expense':
      return 'Large expense alert';
    case 'monthly_summary':
      return 'Monthly summary';
    default:
      return 'Expense Tracker notification';
  }
}

function buildHtml(type: string, payload: Record<string, any>) {
  const amount = payload.amount ? Number(payload.amount).toFixed(2) : '0.00';
  const description = payload.description || 'your activity';
  const category = payload.category || 'General';
  const date = payload.date || new Date().toISOString().slice(0, 10);

  switch (type) {
    case 'welcome':
      return `<p>Welcome to Expense Tracker! Your account is ready.</p>`;
    case 'expense_added':
      return `<p>You added a new expense:</p><ul><li>Description: ${description}</li><li>Amount: $${amount}</li><li>Category: ${category}</li><li>Date: ${date}</li></ul>`;
    case 'large_expense':
      return `<p>Large expense alert:</p><ul><li>Description: ${description}</li><li>Amount: $${amount}</li><li>Category: ${category}</li><li>Date: ${date}</li></ul>`;
    case 'monthly_summary':
      return `<p>Your monthly summary is ready.</p>`;
    default:
      return `<p>Expense Tracker notification.</p>`;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    console.log('send-email-alert preflight OPTIONS request received');
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, {
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const type = String(payload.type || 'generic');
    const email = String(payload.email || '');

    if (!email) {
      return jsonResponse(400, {
        success: false,
        error: 'Missing email address'
      });
    }

    if (!RESEND_API_KEY) {
      return jsonResponse(500, {
        success: false,
        error: 'RESEND_API_KEY is not configured'
      });
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [email],
        subject: getSubject(type),
        html: buildHtml(type, payload)
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return jsonResponse(response.status, {
        success: false,
        error: result?.message || 'Email send failed'
      });
    }

    return jsonResponse(200, {
      success: true,
      message: 'Email alert sent successfully',
      type
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
