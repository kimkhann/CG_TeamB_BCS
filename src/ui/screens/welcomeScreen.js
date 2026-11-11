import { h } from '../dom.js';

/** Application entry over the live model; palette follows the proposal. */
export function showWelcome(onStart) {
  document.body.classList.add('welcome-open');
  const welcome = h(
    'section',
    { class: 'welcome', 'aria-label': 'Welcome to Collapse Lab' },
    h(
      'div',
      { class: 'welcome-top' },
      h('span', {}, 'BCS / TEAM B'),
      h('span', {}, 'COMPUTER GRAPHICS · 2026'),
    ),
    h(
      'div',
      { class: 'welcome-copy' },
      h('p', { class: 'eyebrow' }, 'BUILDING COLLAPSE SIMULATOR'),
      h('h1', {}, h('span', {}, 'Collapse'), h('em', {}, 'Lab.')),
      h(
        'p',
        { class: 'welcome-description' },
        'Design a structure. Test its limits.',
        h('br'),
        'Follow the chain from first failure to final collapse.',
      ),
      h(
        'button',
        {
          class: 'btn primary welcome-start',
          onclick: () => {
            welcome.remove();
            document.body.classList.remove('welcome-open');
            onStart();
          },
        },
        'Start simulation',
        h('span', {}, '→'),
      ),
      h('p', { class: 'welcome-caption' }, '01 SELECT  /  02 SPECIFY  /  03 TEST'),
    ),
    h(
      'div',
      { class: 'welcome-bottom' },
      h('span', {}, 'BUILDING COLLAPSE SIMULATOR'),
      h('span', {}, 'IMPACT / EXPLOSION / EARTHQUAKE / FIRE'),
    ),
  );
  document.body.append(welcome);
  welcome.querySelector('button').focus();
}
