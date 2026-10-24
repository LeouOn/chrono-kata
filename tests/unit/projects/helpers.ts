import { expect } from 'vitest';
import { within } from '@testing-library/react';

/** Every link and button has a name, and the name contains its visible text (WCAG 2.5.3). */
export function expectNamedControls(root: HTMLElement) {
  const controls = [...within(root).queryAllByRole('link'), ...within(root).queryAllByRole('button')];
  for (const control of controls) {
    const visible = (control.textContent ?? '').replace(/\s+/g, ' ').trim();
    const role = control.tagName === 'A' ? 'link' : 'button';
    const named = within(root)
      .getAllByRole(role)
      .filter((candidate) => candidate === control);
    expect(named, 'control must be found by role').toHaveLength(1);
    if (visible !== '') {
      const escaped = visible.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(
        within(root).getAllByRole(role, { name: new RegExp(escaped, 'i') }),
        `"${visible}" must be inside its accessible name`,
      ).toContain(control);
    } else {
      expect(control.getAttribute('aria-label'), 'an icon-only control needs a name').toBeTruthy();
    }
  }
}
