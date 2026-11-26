/**
 * Client half of the dsh-chat-demo bundle.
 *
 * - a floating shortcut at the frame's bottom-right opens the chat-demo page in
 *   a right-sidebar tab, with a second shortcut that opens the same page in a
 *   new browser tab;
 * - the sidebar tab embeds `/chat-demo/` (served by this bundle's Host half) in
 *   an iframe that fills the pane, and syncs the host theme/locale.
 */
window.__ModuleLoader__.load({
  id: 'dsh-chat-demo',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'chat-demo'
    const TAB_ID = 'dsh-chat-demo'
    const TAB_KIND = 'chat-demo'

    const zh = {
      entryLabel: 'Chat',
      openPanel: '在侧栏打开 Chat Demo',
      openPage: '在新页面打开',
      tabTitle: 'Chat Demo',
      reload: '刷新页面',
    }
    const en = {
      entryLabel: 'Chat',
      openPanel: 'Open Chat Demo in the sidebar',
      openPage: 'Open in a new page',
      tabTitle: 'Chat Demo',
      reload: 'Reload',
    }

    const css = `
.dsh-chat-demo-entry{position:fixed;right:16px;bottom:16px;z-index:40;display:flex;align-items:center;gap:8px;pointer-events:auto}
.dsh-chat-demo-main{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-floating-fill,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);box-shadow:0 6px 20px rgba(0,0,0,.18);cursor:pointer;font:inherit;font-size:13px;font-weight:500;line-height:1;transition:background .15s ease,transform .15s ease}
.dsh-chat-demo-main:hover{background:var(--dsw-alias-button-floating-hover,var(--dsw-alias-bg-layer-2));transform:translateY(-1px)}
.dsh-chat-demo-main:active{transform:translateY(0)}
.dsh-chat-demo-side{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-floating-fill,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-secondary);box-shadow:0 6px 20px rgba(0,0,0,.18);cursor:pointer;transition:background .15s ease,color .15s ease}
.dsh-chat-demo-side:hover{background:var(--dsw-alias-button-floating-hover,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}
.dsh-chat-demo-panel{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base)}
.dsh-chat-demo-bar{display:flex;align-items:center;justify-content:flex-end;gap:4px;height:38px;padding:0 8px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.dsh-chat-demo-bar-btn{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px;border-radius:6px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;line-height:1}
.dsh-chat-demo-bar-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-chat-demo-frame{flex:1;width:100%;min-height:0;border:0;display:block;background:var(--dsw-alias-bg-base)}
`

    let api = null

    const zhLike = (id) => typeof id === 'string' && id.toLowerCase().startsWith('zh')

    const activeLocale = () => {
      try {
        const id = api?.locale?.getLocale?.().active
        if (typeof id === 'string' && id.length > 0) {
          return zhLike(id) ? 'zh-CN' : 'en-US'
        }
      } catch {
        // Fall through to the browser language.
      }
      return zhLike(navigator.language) ? 'zh-CN' : 'en-US'
    }

    const isDarkTheme = () => document.body?.hasAttribute('data-ds-dark-theme') === true

    const t = (key) => {
      try {
        return api.locale.bind(NS)(key)
      } catch {
        return zhLike(activeLocale()) && zh[key] !== undefined ? zh[key] : (en[key] ?? key)
      }
    }

    /** Re-render a component when the harness locale changes. */
    const useLocale = () =>
      React.useSyncExternalStore(
        (notify) => api.locale.subscribe(notify),
        () => api.locale.getSnapshot(),
        () => api.locale.getSnapshot()
      )

    const pageUrl = () => {
      const url = new URL('/chat-demo/', window.location.origin)
      url.searchParams.set('dsh-theme', isDarkTheme() ? 'dark' : 'light')
      url.searchParams.set('dsh-locale', activeLocale())
      return url.toString()
    }

    const openNewPage = () => {
      window.open(pageUrl(), '_blank', 'noopener,noreferrer')
    }

    const openPanel = () => {
      try {
        api.sidebarRight.openTab(TAB_KIND)
      } catch {
        // No session is on screen (or the column is unavailable): a page still works.
        openNewPage()
      }
    }

    const chatIcon = () =>
      h(
        'svg',
        {
          width: 18,
          height: 18,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M21 11.5a8.4 8.4 0 0 1-8.5 8.3 9.9 9.9 0 0 1-3.4-.6L4 21l1.7-4.1A8 8 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z' })
      )

    const externalIcon = () =>
      h(
        'svg',
        {
          width: 15,
          height: 15,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M14 4h6v6' }),
        h('path', { d: 'M20 4 11 13' }),
        h('path', { d: 'M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5' })
      )

    function ChatDemoEntry() {
      useLocale()
      // The right column already fills the frame's bottom-right corner while
      // expanded; hide the floating launcher then and let the panel's own
      // toolbar provide the page actions.
      const [columnExpanded, setColumnExpanded] = React.useState(() => {
        try {
          return api.sidebarRight.isExpanded() === true
        } catch {
          return false
        }
      })
      React.useEffect(() => {
        const timer = setInterval(() => {
          let expanded = false
          try {
            expanded = api.sidebarRight.isExpanded() === true
          } catch {
            expanded = false
          }
          setColumnExpanded((previous) => (previous === expanded ? previous : expanded))
        }, 500)
        return () => clearInterval(timer)
      }, [])
      if (columnExpanded) {
        return null
      }
      return h(
        'div',
        { className: 'dsh-chat-demo-entry' },
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-chat-demo-main',
            title: t('openPanel'),
            'aria-label': t('openPanel'),
            onClick: openPanel,
          },
          chatIcon(),
          h('span', null, t('entryLabel'))
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-chat-demo-side',
            title: t('openPage'),
            'aria-label': t('openPage'),
            onClick: openNewPage,
          },
          externalIcon()
        )
      )
    }

    function ChatDemoPanel() {
      useLocale()
      const [revision, setRevision] = React.useState(0)
      const src = React.useMemo(() => pageUrl(), [revision])
      return h(
        'div',
        { className: 'dsh-chat-demo-panel' },
        h(
          'div',
          { className: 'dsh-chat-demo-bar' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-chat-demo-bar-btn',
              title: t('openPage'),
              onClick: openNewPage,
            },
            externalIcon(),
            h('span', null, t('openPage'))
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-chat-demo-bar-btn',
              title: t('reload'),
              onClick: () => setRevision((value) => value + 1),
            },
            h('span', { 'aria-hidden': true }, '↻'),
            h('span', null, t('reload'))
          )
        ),
        h('iframe', {
          key: revision,
          className: 'dsh-chat-demo-frame',
          src,
          title: t('tabTitle'),
          allow: 'microphone; clipboard-read; clipboard-write; autoplay; fullscreen',
        })
      )
    }

    return {
      inject: ['slots', 'sidebarRight', 'sidebarRightTabs', 'locale'],
      apply(ctx) {
        api = ctx
        ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'chat-demo: zh dictionary')
        ctx.effect(() => ctx.locale.register(NS, 'en', en), 'chat-demo: en dictionary')
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.dshPlugin = 'dsh-chat-demo'
          style.textContent = css
          document.head.append(style)
          return () => style.remove()
        }, 'chat-demo: styles')
        ctx.effect(
          () =>
            ctx.sidebarRightTabs.register({
              id: TAB_ID,
              kind: TAB_KIND,
              priority: 'extension',
              title: () => t('tabTitle'),
            }),
          'chat-demo: sidebar tab type'
        )
        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register(
            { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS },
            ChatDemoPanel
          )
        )
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'chat-demo.entry', locale: NS },
            ChatDemoEntry
          )
        )
      },
    }
  },
})
