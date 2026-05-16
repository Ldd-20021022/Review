import { createApp } from 'vue'
import ElementPlus from '/src/shim/element-plus.js'
import router from './router/index.js'
import App from './App.js'

const app = createApp(App)
app.use(ElementPlus)
app.use(router)
app.mount('#app')
