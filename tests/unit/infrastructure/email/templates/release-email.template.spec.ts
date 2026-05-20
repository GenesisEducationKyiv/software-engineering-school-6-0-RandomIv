import { ReleaseEmailTemplate } from '../../../../../src/infrastructure/email/templates/release-email.template';
import { AppUrlBuilder } from '../../../../../src/infrastructure/email/app-url-builder';

describe('ReleaseEmailTemplate', () => {
  it('renders release URL and unsubscribe link', () => {
    const tpl = new ReleaseEmailTemplate(new AppUrlBuilder('http://x'));
    const msg = tpl.render({
      to: 'a@b.c',
      repository: 'owner/repo',
      version: 'v2',
      unsubscribeToken: 'UNSUB',
    });

    expect(msg.subject).toContain('v2');
    expect(msg.text).toContain('https://github.com/owner/repo/releases/tag/v2');
    expect(msg.text).toContain('http://x/web/unsubscribe/UNSUB');
  });
});
