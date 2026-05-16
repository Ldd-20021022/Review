// Shim: re-export Pinia globals as ESM named exports
const { createPinia, defineStore } = Pinia
export { createPinia, defineStore }
export default Pinia
