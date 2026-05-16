// esbuild-based production build — avoids rollup native module (blocked by WDAC)
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

fs.mkdirSync('dist', { recursive: true });

let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('EMR 评级自评系统', '三甲医院评级系统');
html = html.replace('/src/main.js', '/main.js');
html = html.replace(
  '"/src/shim/vue.js"',
  '"/shim-vue.js"'
);
html = html.replace(
  '"/src/shim/vue-router.js"',
  '"/shim-vue-router.js"'
);
fs.writeFileSync('dist/index.html', html);

fs.copyFileSync('favicon.svg', 'dist/favicon.svg');
fs.copyFileSync('src/shim/vue.js', 'dist/shim-vue.js');
fs.copyFileSync('src/shim/vue-router.js', 'dist/shim-vue-router.js');
fs.copyFileSync('src/shim/element-plus.js', 'dist/shim-element-plus.js');
fs.copyFileSync('src/shim/pinia.js', 'dist/shim-pinia.js');

esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  outfile: 'dist/main.js',
  format: 'esm',
  target: 'es2020',
  minify: true,
  sourcemap: true,
  plugins: [{
    name: 'resolve-shim',
    setup(build) {
      // /src/shim/* → relative to project root
      build.onResolve({ filter: /^\/src\/shim\/.*\.js$/ }, (args) => {
        return { path: path.join(__dirname, args.path) };
      });
    },
  }],
  // vue/vue-router are CDN globals (via import maps → shims)
  // Mark them external so esbuild doesn't bundle from node_modules
  external: ['vue', 'vue-router'],
}).then(() => {
  console.log('Build complete! dist/main.js');
}).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
