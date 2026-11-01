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
        {
          tag: 'script',
          content: `
            // PostHog product analytics. The project token is a public
            // client-side key.
            !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
            posthog.init("phc_vNhFnzdau6swu7h27iuhpcfsekhD4rwaGYjNMyDibtt9", {
              api_host: "https://us.i.posthog.com",
              ui_host: "https://us.posthog.com",
              defaults: "2026-05-30",
              person_profiles: "identified_only",
              cross_subdomain_cookie: true,
            });

            document.addEventListener("click", function (event) {
              var target = event.target;
              if (!target || !target.closest || !window.posthog) return;
              var link = target.closest("a");
              if (!link) return;
              var href = link.getAttribute("href") || "";
              if (href.indexOf("app.database.pizza") !== -1) {
                posthog.capture("signup_clicked", { href: href });
              } else if (href && href.charAt(0) !== "/" && href.charAt(0) !== "#") {
                posthog.capture("outbound_clicked", { host: link.host, href: href });
              }
            }, true);

            document.addEventListener("copy", function () {
              var selection = window.getSelection();
              if (!selection || selection.rangeCount === 0 || !window.posthog) return;
              var node = selection.getRangeAt(0).startContainer;
              var element = node.nodeType === 1 ? node : node.parentElement;
              if (element && element.closest("pre")) posthog.capture("code_copied");
            });
          `,
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
            { label: 'MCP for agents', link: '/clients/mcp/' },
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
            { label: 'Notifications', link: '/sql-reference/notifications/' },
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
            { label: 'Engine updates', link: '/guides/engine-updates/' },
            { label: 'Sign in & account security', link: '/guides/authentication/' },
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
