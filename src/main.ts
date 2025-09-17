import './assets/main.css'
import i18n from './i18n'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import 'leaflet/dist/leaflet.css'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'

import App from './App.vue'
import router from './router'

const app = createApp(App)

let i18nInstance = await i18n()

app.use(createPinia())
app.use(router)
app.use(PrimeVue)
app.use(i18nInstance)

app.mount('#app')
