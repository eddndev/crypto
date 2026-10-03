# Publicación y despliegues

- Publicar los cambios del sitio mediante commits y push a GitHub.
- Realizar todos los despliegues mediante el workflow de GitHub Actions en
  `.github/workflows/deploy.yml`, activado por un push a `main`.
- No ejecutar despliegues directos desde la computadora, la terminal local,
  herramientas de hosting ni APIs del proveedor.
- Antes del push, ejecutar las pruebas C/WebAssembly y la compilación del sitio.
- Después del push, comprobar el resultado de CI y del despliegue en GitHub.

# Núcleo y prácticas

- Las prácticas educativas reutilizan `c/handcrafted/include/bigint.h` y
  `c/handcrafted/src/bigint.c`; no duplicar el núcleo por actividad.
- Para entradas nuevas, usar las operaciones comprobadas y respetar sus contratos
  en `c/handcrafted/README.md`. La aritmética sigue siendo de tiempo variable.
- La práctica 04 usa OpenSSL 3 para ECDSA y ECDH estándar, en C nativo y
  WebAssembly. Mantener esta biblioteca para claves y curvas de dicha práctica.
- Al cambiar Handcrafted, ejecutar sus pruebas y sanitizadores, además de las
  regresiones de las prácticas que comparten el núcleo.
