// Shim: re-export Vue globals as ESM named exports
const { ref, reactive, computed, watch, onMounted, defineComponent, createApp } = Vue
export { ref, reactive, computed, watch, onMounted, defineComponent, createApp }
export default Vue
