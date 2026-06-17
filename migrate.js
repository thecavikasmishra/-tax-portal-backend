const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'TaxPortal <onboarding@resend.dev>';
const ADMIN = process.env.ADMIN_EMAIL;

async function sendAdminNotification({ clientName, clientEmail, action, fileCount, dashboardUrl }) {
  const subject = action === 'submit'
    ? '[TaxPortal] ' + clientName + ' has submitted all documents'
    : '[TaxPortal] ' + clientName + ' uploaded ' + fileCount + ' file(s)';
  await resend.emails.send({
    from: FROM, to: ADMIN, subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#534AB7;padding:20px;border-radius:8px 8px 0 0">
        <h1 style="color:white;margin:0;font-size:20px">Tax Document Portal</h1>
      </div>
      <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e0e0e0">
        <h2 style="color:#333;margin-top:0">${action === 'submit' ? 'Documents Submitted' : 'New Upload'}</h2>
        <p style="color:#555"><strong>${clientName}</strong> ${action === 'submit' ? 'has submitted all documents.' : 'uploaded ' + fileCount + ' file(s).'}</p>
        <a href="${dashboardUrl}" style="display:inline-block;background:#534AB7;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px">View in Dashboard</a>
      </div>
    </div>`,
  });
}

async function sendClientReminder({ clientName, clientEmail, portalUrl, pendingCount, completionPct }) {
  if (!clientEmail) return;
  await resend.emails.send({
    from: FROM, to: clientEmail,
    subject: 'Reminder: ' + pendingCount + ' document(s) pending for your ITR filing',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#534AB7;padding:20px;border-radius:8px 8px 0 0">
        <h1 style="color:white;margin:0;font-size:20px">Income Tax Document Portal</h1>
      </div>
      <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e0e0e0">
        <h2 style="color:#333;margin-top:0">Hi ${clientName},</h2>
        <p style="color:#555">Your ITR document collection is <strong>${completionPct}% complete</strong>. You have <strong>${pendingCount} pending item(s)</strong> left.</p>
        <a href="${portalUrl}" style="display:inline-block;background:#534AB7;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px">Continue Uploading</a>
        <p style="color:#999;font-size:12px;margin-top:24px">Automated reminder from your CA portal.</p>
      </div>
    </div>`,
  });
}

async function sendClientWelcome({ clientName, clientEmail, portalUrl, financialYear }) {
  if (!clientEmail) return;
  await resend.emails.send({
    from: FROM, to: clientEmail,
    subject: 'Your ITR document portal for FY ' + financialYear + ' is ready',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#534AB7;padding:20px;border-radius:8px 8px 0 0">
        <h1 style="color:white;margin:0;font-size:20px">Income Tax Document Portal</h1>
      </div>
      <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e0e0e0">
        <h2 style="color:#333;margin-top:0">Hi ${clientName},</h2>
        <p style="color:#555">Your document portal for FY ${financialYear} is ready.</p>
        <a href="${portalUrl}" style="display:inline-block;background:#534AB7;color:white;padding:14px 28px;border-radius:6px;text-decoration:none;margin-top:12px;font-size:16px">Open My Portal</a>
        <p style="color:#999;font-size:12px;margin-top:24px">This link is unique to you.</p>
      </div>
    </div>`,
  });
}

module.exports = { sendAdminNotification, sendClientReminder, sendClientWelcome };
