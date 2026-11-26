import { defineConfig } from 'vitepress';
import { readFileSync } from 'node:fs';
import navigation from './navigation.json';
const { version } = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
export default defineConfig({
  title: 'AI Harness',
  description: 'Local-first AI Software Engineering Harness. Experimental, supervised and provider-agnostic.',
  lang: 'en-US',
  base: '/ai-harness/',
  cleanUrls: false,
  lastUpdated: false,
  appearance: true,
  srcExclude: ['scripts/**', '**/node_modules/**'],
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/ai-harness/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#18564b' }],
    ['meta', { name: 'referrer', content: 'strict-origin-when-cross-origin' }],
  ],
  themeConfig: {
    logo: { src: '/logo.svg', alt: 'AI Harness' },
    siteTitle: 'AI Harness',
    nav: [
      { text: 'Start', link: '/getting-started/' },
      { text: 'Explore', items: [
        { text: 'User Guide', link: '/guide/cli' },
        { text: 'Architecture', link: '/architecture/' },
        { text: 'Security', link: '/security/' },
        { text: 'Reference', link: '/reference/cli' },
        { text: 'Development', link: '/development/' },
      ] },
      { text: `Experimental · v${version}`, items: [
        { text: 'Capability status', link: '/releases/capabilities' },
        { text: 'Beta readiness', link: '/releases/beta' },
        { text: 'Development', link: '/development/' },
        { text: 'Source & history', link: '/releases/sources' },
      ] },
    ],
    sidebar: Object.fromEntries(navigation.map(group => [`/${group.id}/`, [
      { text: group.text, items: group.items },
      { text: 'Evidence & release', items: [
        { text: 'Capability status', link: '/releases/capabilities' },
        { text: 'Known limitations', link: '/security/limitations' },
        { text: 'Beta readiness', link: '/releases/beta' },
      ] },
    ]])),
    search: { provider: 'local' },
    outline: { level: [2, 3], label: 'On this page' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/fjmedina21/ai-harness' }],
    footer: { message: `Experimental v${version} · Human approval required · No production autonomy claim` },
  },
});
