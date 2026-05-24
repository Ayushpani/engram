import { Resend } from 'resend';

// Only instantiate Resend if the key is available, preventing crash on build/boot if env var is missing
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(req: Request) {
  try {
    const { email, useCase } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email required' }, { status: 400 });
    }

    if (!resend) {
      console.warn("Waitlist submission received, but RESEND_API_KEY is not set.");
      // In local dev without API key, still return success to test the UI flow
      return Response.json({ success: true, warning: 'RESEND_API_KEY not configured' });
    }

    // Email 1: Notify you
    const { data: data1, error: error1 } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'ayushpanigrahi84@gmail.com',
      subject: `New beta request: ${email}`,
      text: `Email: ${email}\nUse case: ${useCase ?? 'not provided'}`,
    });

    if (error1) {
      console.error("Resend Error 1:", error1);
      return Response.json({ error: error1.message }, { status: 500 });
    }

    // Email 2: Confirm to them
    const { data: data2, error: error2 } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'You are on the Smaran beta list',
      html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #030912; color: #ffffff; padding: 40px 20px; text-align: center;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px; background-color: #06101F; border: 1px solid #1e293b; border-radius: 16px; text-align: left;">
    <h2 style="margin: 0 0 24px; font-size: 24px; font-weight: 600; color: #ffffff;">smaran</h2>
    <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 16px; color: #ffffff;">You're on the list</h1>
    <p style="font-size: 15px; line-height: 1.6; color: #94a3b8; margin: 0 0 24px;">Hey there,</p>
    <p style="font-size: 15px; line-height: 1.6; color: #94a3b8; margin: 0 0 24px;">Thanks for your interest in Smaran. We are currently in a closed beta to ensure our early adopters get a seamless, personalized experience.</p>
    <p style="font-size: 15px; line-height: 1.6; color: #94a3b8; margin: 0 0 24px;">I review every request personally. If your use case is a good fit, I will email you an <strong style="color: #ffffff;">API key within 48 hours</strong> along with a short setup guide.</p>
    <p style="font-size: 15px; line-height: 1.6; color: #94a3b8; margin: 0 0 24px;">If you want to move faster, <strong>reply to this email</strong> and tell me what you are building. I prioritize people who share context.</p>
    <p style="font-size: 15px; line-height: 1.6; color: #94a3b8; margin: 0 0 24px;">The MCP server and edge reranker are live. Once you have your key, you can connect Smaran to Claude Desktop or Cursor in under 5 minutes.</p>
    <p style="font-size: 15px; line-height: 1.6; color: #94a3b8; margin: 0;">— Ayush<br>Builder of Smaran</p>
  </div>
  <p style="font-size: 12px; color: #475569; margin-top: 32px;">© ${new Date().getFullYear()} Smaran. All rights reserved.</p>
</div>
      `
    });

    if (error2) {
      console.error("Resend Error 2:", error2);
      return Response.json({ error: error2.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Waitlist Error:", error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
