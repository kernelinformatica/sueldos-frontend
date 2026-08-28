CI/CD y despliegue — Front-end (Angular 22, Node 24)

Objetivo
- Construir la aplicación Angular y desplegar artefactos estáticos en un entorno de hosting (ej. Azure Static Web Apps, Netlify, GitHub Pages o servidor estático).

Requisitos en runner/servidor
- Node.js 24.x
- npm 9+ (o el bundler que uses)

Comandos locales
```powershell
# usar Node 24 (nvm)
nvm use 24

# instalar dependencias
npm install
# si hay conflictos de peer deps:
npm install --legacy-peer-deps
# o, si entiendes riesgos, forzar:
npm install --force

# build de producción
npx ng build --configuration production
# resultado: dist/front-v1
```

Sugerencia de workflow GitHub Actions (build + artefacto):
- Crea archivo: `.github/workflows/build-and-artifact.yml`

```yaml
name: Build Angular (production)

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Use Node 24
        uses: actions/setup-node@v4
        with:
          node-version: '24'
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build --if-present --silent
      - name: Upload dist
        uses: actions/upload-artifact@v4
        with:
          name: front-dist
          path: dist/front-v1
```

Despliegue a GitHub Pages (ejemplo simple)
- Requiere build y push de `dist/front-v1` a la rama `gh-pages`.
- Usa `JamesIves/github-pages-deploy-action`:

```yaml
- name: Deploy to GitHub Pages
  uses: JamesIves/github-pages-deploy-action@v4
  with:
    branch: gh-pages
    folder: dist/front-v1
```

Despliegue a Azure Static Web Apps o Netlify
- Ambos servicios integran build & deploy directamente desde el repo: configura el build command `npm run build` y el folder de salida `dist/front-v1`.

Notas de configuración y seguridad
- Establece `NODE_ENV=production` en el runner/entorno de despliegue.
- No incluyas secrets en `package.json`. Usa `secrets` en las acciones o variables en el host.
- Revisa que `index.html` use CDN para librerías grandes (ya movimos Bootstrap a CDN).

Verificaciones post-despliegue
- Probar login, navegación de módulos cargados perezosamente, exportaciones y descargas.
- Revisar consola del navegador para errores de CORS o rutas base (`<base href="/">`).

Si quieres, genero:
- El archivo `.github/workflows/build-and-artifact.yml` ya listo y lo añado al repo.
- Un workflow completo que despliegue a GitHub Pages o Netlify (elige servicio).

Archivo generado automáticamente por el asistente.
