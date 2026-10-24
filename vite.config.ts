import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two build targets:
//  - default: normal Vite build for Vercel (React bundled).
//  - artifact: one HTML file, React loaded from cdnjs as globals (claude.ai artifact preview).
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    esbuild: { jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' },
    plugins: artifact ? [viteSingleFile()] : [],
    build: artifact
      ? {
          outDir: 'dist-artifact',
          rollupOptions: {
            external: ['react', 'react-dom', 'react-dom/client'],
            output: {
              format: 'iife',
              globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
            },
          },
        }
      : { outDir: 'dist' },
  };
});
