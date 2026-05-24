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
    await resend.emails.send({
      from: 'waitlist@engram.ai',
      to: 'ayush@engram.ai',
      subject: `New Engram beta request: ${email}`,
      text: `Email: ${email}\nUse case: ${useCase ?? 'not provided'}`,
    });

    // Email 2: Confirm to them
    await resend.emails.send({
      from: 'Ayush at Engram <ayush@engram.ai>',
      to: email,
      subject: 'You are on the Engram beta list',
      text: `Hey,

Thanks for your interest in Engram.

I review every request personally. If your use case is a good fit, I will email you an API key within 48 hours along with a short setup guide.

If you want to move faster, reply to this email and tell me what you are building. I prioritise people who share context.

The MCP server and reranker are already live. Once you have a key, you can connect Engram to Claude Desktop or Cursor in under 5 minutes.

— Ayush
Builder of Engram`,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Waitlist Error:", error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
