// Shim: re-export Vue globals as ESM named exports
const { ref, reactive, computed, watch, onMounted, onUnmounted, defineComponent, createApp } = Vue
export { ref, reactive, computed, watch, onMounted, onUnmounted, defineComponent, createApp }
export default Vue
