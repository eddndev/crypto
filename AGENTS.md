# Publicación y despliegues

- Publicar los cambios del sitio mediante commits y push a GitHub.
- Realizar todos los despliegues mediante el workflow de GitHub Actions en
  `.github/workflows/deploy.yml`, activado por un push a `main`.
- No ejecutar despliegues directos desde la computadora, la terminal local,
  herramientas de hosting ni APIs del proveedor.
- Antes del push, ejecutar las pruebas C/WebAssembly y la compilación del sitio.
- Después del push, comprobar el resultado de CI y del despliegue en GitHub.
