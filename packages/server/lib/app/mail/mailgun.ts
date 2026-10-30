import { authenticate, request } from "@fastr/client";
import { injectable } from "@fastr/invert";
import { Env } from "@keybr/config";
import { Mailer } from "./types.ts";

@injectable({ singleton: true })
export class MailgunConfig {
  readonly domain: string;
  readonly key: string;
  readonly from: string;

  constructor() {
    // Both are optional: an instance that disables e-mail login
    // (AUTH_EMAIL_LOGIN=false) never sends mail, and should not have to
    // fabricate Mailgun credentials just to start.
    this.domain = Env.getString("MAIL_DOMAIN", "");
    this.key = Env.getString("MAIL_KEY", "");
    const fromAddress = Env.getString("MAIL_FROM_ADDRESS", "k@keybr.com");
    const fromName = Env.getString("MAIL_FROM_NAME", "keybr.com");
    this.from = `${fromName} <${fromAddress}>`;
  }
}

@injectable()
export class MailgunMailer extends Mailer {
  constructor(readonly config: MailgunConfig) {
    super();
  }

  async sendMail({
    from = this.config.from,
    to,
    subject,
    text,
    html,
  }: Mailer.Message): Promise<void> {
    if (this.config.domain === "" || this.config.key === "") {
      throw new Error("Mail is not configured: set MAIL_DOMAIN and MAIL_KEY");
    }
    const body = new URLSearchParams([
      ["from", from],
      ["to", to],
      ["subject", subject],
    ]);
    if (text) {
      body.append("text", text);
    }
    if (html) {
      body.append("html", html);
    }

    const response = await request
      .use(authenticate.basic("api", this.config.key))
      .POST(`https://api.mailgun.net/v3/${this.config.domain}/messages`)
      .send(body);

    if (response.ok) {
      const { id } = await response.body.json<{ id: string }>();
    } else {
      response.abort();
      throw new Error(
        `Unable to send email: ${response.status} ${response.statusText}`,
      );
    }
  }
}
