import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.database.pizza',
  integrations: [
    starlight({
      title: 'database.pizza docs',
      description: 'A safety-first SQL database for small and AI-built applications, with row history, schema history, and scoped, reviewable undo.',
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
      components: {
        PageTitle: './src/components/PageTitle.astro',
        SiteTitle: './src/components/SiteTitle.astro',
      },
      head: [
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: '#090b09' },
        },
        {
          tag: 'link',
          attrs: { rel: 'alternate', type: 'text/plain', href: '/llms.txt', title: 'LLM documentation index' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: 'https://docs.database.pizza/og.png' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:alt', content: 'database.pizza documentation' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: 'https://docs.database.pizza/og.png' },
        },
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/database-pizza' },
      ],
      lastUpdated: true,
      pagination: true,
      expressiveCode: {
        themes: ['github-light', 'vesper'],
        styleOverrides: {
          borderRadius: '0.75rem',
          borderColor: 'var(--sl-color-gray-5)',
          frames: {
            editorActiveTabBackground: 'var(--sl-color-gray-6)',
            editorActiveTabForeground: 'var(--sl-color-white)',
            editorTabBarBackground: 'var(--sl-color-bg-nav)',
            editorTabBarBorderColor: 'var(--sl-color-gray-5)',
          },
        },
      },
      sidebar: [
        { label: 'Overview', link: '/' },
        {
          label: 'Start Here',
          items: [
            { label: 'Quickstart', link: '/getting-started/quickstart/' },
            { label: 'Connect', link: '/getting-started/connect/' },
            { label: 'Your first schema', link: '/getting-started/first-schema/' },
          ],
        },
        {
          label: 'History & recovery',
          items: [
            { label: 'Change history', link: '/history/change-history/' },
            { label: 'Undo & recovery', link: '/history/undo-recovery/' },
          ],
        },
        {
          label: 'Use Your Database',
          items: [
            { label: 'PostgreSQL clients', link: '/clients/postgresql/' },
            { label: 'HTTP query API', link: '/clients/http-api/' },
            { label: 'JavaScript', link: '/clients/javascript/' },
            { label: 'Python', link: '/clients/python/' },
            { label: 'REST API (preview)', link: '/clients/rest-api/' },
            { label: 'API keys & permissions', link: '/clients/api-keys/' },
          ],
        },
        {
          label: 'SQL Reference',
          items: [
            { label: 'SQL at a glance', link: '/sql-reference/overview/' },
            { label: 'Data types', link: '/sql-reference/data-types/' },
            { label: 'Statements', link: '/sql-reference/statements/' },
            { label: 'Expressions & operators', link: '/sql-reference/expressions/' },
            { label: 'Functions', link: '/sql-reference/functions/' },
            { label: 'Constraints', link: '/sql-reference/constraints/' },
            { label: 'Compatibility', link: '/sql-reference/compatibility/' },
          ],
        },
        {
          label: 'Indexes & Transactions',
          items: [
            { label: 'Indexes', link: '/engine/indexes/' },
            { label: 'Transactions', link: '/engine/transactions/' },
            { label: 'Concurrency', link: '/engine/concurrency/' },
          ],
        },
        {
          label: 'Engine Internals',
          items: [
            { label: 'Architecture', link: '/internals/architecture/' },
            { label: 'Query lifecycle', link: '/internals/query-lifecycle/' },
            { label: 'Storage model', link: '/internals/storage/' },
            { label: 'Catalog & schema', link: '/internals/catalog/' },
            { label: 'PostgreSQL protocol', link: '/internals/postgres-protocol/' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Import & export', link: '/guides/import-export/' },
            { label: 'Errors & troubleshooting', link: '/guides/errors/' },
            { label: 'Limits & quotas', link: '/guides/limits/' },
          ],
        },
        {
          label: 'Releases',
          items: [
            { label: 'Release policy', link: '/releases/' },
            { label: 'Release notes', link: '/releases/release-notes/' },
          ],
        },
        {
          label: 'For AI Tools',
          items: [
            { label: 'Using these docs with AI', link: '/ai/' },
            { label: 'llms.txt', link: '/llms.txt', attrs: { target: '_blank' } },
            { label: 'llms-full.txt', link: '/llms-full.txt', attrs: { target: '_blank' } },
          ],
        },
      ],
    }),
  ],
});
