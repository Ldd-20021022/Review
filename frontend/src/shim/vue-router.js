// Shim: re-export VueRouter globals as ESM named exports
const { createRouter, createWebHashHistory, createWebHistory, useRouter, useRoute } = VueRouter
export { createRouter, createWebHashHistory, createWebHistory, useRouter, useRoute }
export default VueRouter
