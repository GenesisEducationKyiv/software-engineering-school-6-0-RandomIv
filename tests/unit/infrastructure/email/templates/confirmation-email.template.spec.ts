import { ConfirmationEmailTemplate } from '../../../../../src/infrastructure/email/templates/confirmation-email.template';
import { AppUrlBuilder } from '../../../../../src/infrastructure/email/app-url-builder';
import { Subscription } from '../../../../../src/domain/subscription/subscription.entity';

describe('ConfirmationEmailTemplate', () => {
  it('renders subject and links', () => {
    const tpl = new ConfirmationEmailTemplate(new AppUrlBuilder('http://x'));
    const sub = new Subscription('id', 'a@b.c', 'r1', 'CONF-TOK', 'UNSUB-TOK', false);

    const msg = tpl.render(sub, 'owner/repo');

    expect(msg.to).toBe('a@b.c');
    expect(msg.subject).toContain('owner/repo');
    expect(msg.text).toContain('http://x/web/confirm/CONF-TOK');
    expect(msg.text).toContain('http://x/web/unsubscribe/UNSUB-TOK');
    expect(msg.html).toContain('http://x/web/confirm/CONF-TOK');
  });
});
