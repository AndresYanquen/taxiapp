import { createI18n } from 'vue-i18n'

const numberFormats = {
  'es-CO': {
    currency: {
      style: 'currency',
      currency: 'COP',
    },
  },
}

async function loadMessages() {
  const messages = {}
  const importAll = import.meta.glob('./locales/*.json')
  for (const path in importAll) {
    const fileContent: any = await importAll[path]()
    const matched = path.match(/([A-Za-z0-9-_]+)\./i)

    if (matched && matched.length > 1) {
      const locale = matched[1]
      messages[locale] = JSON.parse(JSON.stringify(fileContent.default))
    }
  }

  console.log('messages', messages)

  return createI18n({
    locale: import.meta.env.VITE_APP_I18N_LOCALE || 'es',
    globalInjection: true,
    fallbackLocale: import.meta.env.VITE_APP_I18N_FALLBACK_LOCALE || 'es',
    messages: messages,
    numberFormats,
  })
}

export default loadMessages
